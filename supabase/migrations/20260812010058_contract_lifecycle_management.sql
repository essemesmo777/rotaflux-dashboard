-- Safe contract lifecycle: soft delete by default, auditable restoration and
-- permanent deletion only when PostgreSQL RESTRICT foreign keys allow it.

alter table public.contracts
  add column deleted_at timestamptz,
  add column deleted_by uuid references public.profiles(id) on update restrict on delete restrict;

alter table public.contracts drop constraint if exists contracts_status_check;
alter table public.contracts
  add constraint contracts_status_check
    check (status in ('ACTIVE', 'INACTIVE', 'CLOSED', 'DELETED')),
  add constraint contracts_deletion_state_check check (
    (status = 'DELETED' and deleted_at is not null and deleted_by is not null)
    or (status <> 'DELETED' and deleted_at is null and deleted_by is null)
  );

create index contracts_active_org_status_dates_idx
  on public.contracts (organization_id, status, start_date, end_date)
  where deleted_at is null;

create index contracts_deleted_org_deleted_at_idx
  on public.contracts (organization_id, deleted_at desc)
  where deleted_at is not null;

create index contracts_deleted_by_idx
  on public.contracts (deleted_by)
  where deleted_by is not null;

create or replace function private.enforce_contract_lifecycle()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if not private.is_manager() then
    raise exception 'Somente administradores podem gerenciar contratos.' using errcode = '42501';
  end if;

  if old.deleted_at is null and new.deleted_at is not null then
    if new.status <> 'DELETED' or new.deleted_by is distinct from (select auth.uid()) then
      raise exception 'A exclusão do contrato deve registrar o administrador autenticado.' using errcode = '42501';
    end if;
  elsif old.deleted_at is not null and new.deleted_at is null then
    if new.status = 'DELETED' or new.deleted_by is not null then
      raise exception 'A restauração do contrato deve limpar os campos de exclusão.' using errcode = '23514';
    end if;
  elsif old.deleted_at is not null and (
    new.deleted_at is distinct from old.deleted_at
    or new.deleted_by is distinct from old.deleted_by
    or new.status is distinct from old.status
  ) then
    raise exception 'Restaure o contrato antes de alterá-lo.' using errcode = '55000';
  end if;

  return new;
end;
$$;

drop trigger if exists contracts_enforce_lifecycle on public.contracts;
create trigger contracts_enforce_lifecycle
before update of status, deleted_at, deleted_by on public.contracts
for each row execute function private.enforce_contract_lifecycle();

revoke all on function private.enforce_contract_lifecycle() from public, anon, authenticated, service_role;

create or replace function private.audit_contract_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  audit_action text;
  row_id uuid;
  tenant_id uuid;
begin
  row_id := case when tg_op = 'DELETE' then old.id else new.id end;
  tenant_id := case when tg_op = 'DELETE' then old.organization_id else new.organization_id end;
  audit_action := case
    when tg_op = 'DELETE' then 'CONTRACT_PERMANENTLY_DELETED'
    when tg_op = 'UPDATE' and old.deleted_at is null and new.deleted_at is not null then 'CONTRACT_DELETED'
    when tg_op = 'UPDATE' and old.deleted_at is not null and new.deleted_at is null then 'CONTRACT_RESTORED'
    else tg_op
  end;

  insert into public.audit_logs (
    organization_id, user_id, action, entity, entity_id, old_data, new_data, metadata
  ) values (
    tenant_id,
    (select auth.uid()),
    audit_action,
    'contracts',
    row_id,
    case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) else null end,
    case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) else null end,
    jsonb_build_object(
      'source', 'database_trigger',
      'contract_name', case when tg_op = 'DELETE' then old.name else new.name end
    )
  );

  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

drop trigger if exists contracts_audit_tenant_change on public.contracts;
create trigger contracts_audit_tenant_change
after insert or update or delete on public.contracts
for each row execute function private.audit_contract_change();

revoke all on function private.audit_contract_change() from public, anon, authenticated, service_role;

drop policy if exists contracts_delete on public.contracts;
create policy contracts_delete on public.contracts for delete to authenticated
using (
  private.is_super_admin()
  or (private.is_company_admin() and organization_id = private.current_organization_id())
);

grant update (deleted_at, deleted_by, status, updated_at) on public.contracts to authenticated;
grant delete on public.contracts to authenticated;

comment on column public.contracts.deleted_at is 'Soft delete: contratos com valor não nulo ficam fora dos cálculos e listas ativas.';
comment on column public.contracts.deleted_by is 'Administrador autenticado responsável pelo soft delete.';
