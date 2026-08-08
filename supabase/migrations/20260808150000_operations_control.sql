alter type public.app_role add value if not exists 'ADMIN';

alter table public.imports
  add column if not exists source_type text not null default 'EXCEL',
  add column if not exists review_status text not null default 'CONFIRMED',
  add column if not exists ocr_confidence numeric(5, 2),
  add column if not exists validation_summary jsonb not null default '{}'::jsonb,
  add column if not exists confirmed_at timestamptz;

alter table public.imports
  add constraint imports_source_type_check
    check (source_type in ('EXCEL', 'CSV', 'PDF', 'IMAGE')),
  add constraint imports_review_status_check
    check (review_status in ('PENDING_REVIEW', 'CONFIRMED', 'CANCELLED')),
  add constraint imports_ocr_confidence_check
    check (ocr_confidence is null or (ocr_confidence >= 0 and ocr_confidence <= 100));

alter table public.routes
  add column if not exists plate text,
  add column if not exists supervisor text,
  add column if not exists refueled boolean not null default false,
  add column if not exists refuel_odometer numeric(12, 1),
  add column if not exists overtime_start time,
  add column if not exists overtime_end time,
  add column if not exists requester text,
  add column if not exists notes text,
  add column if not exists source text not null default 'MANUAL',
  add column if not exists source_confidence numeric(5, 2),
  add column if not exists discrepancy_justification text,
  add column if not exists duplicate_override boolean not null default false;

update public.routes
set plate = vehicle
where plate is null or btrim(plate) = '';

alter table public.routes
  alter column plate set not null,
  alter column liters drop not null,
  alter column liters drop default;

alter table public.routes drop constraint if exists routes_odometer_order;
alter table public.routes
  add constraint routes_odometer_total_check check (
    start_odometer is null or end_odometer is null or
    (end_odometer > start_odometer and km = end_odometer - start_odometer)
  ),
  add constraint routes_refuel_data_check check (
    not refueled or (refuel_odometer is not null and liters is not null and liters > 0)
  ),
  add constraint routes_refuel_odometer_range_check check (
    refuel_odometer is null or start_odometer is null or end_odometer is null or
    refuel_odometer between start_odometer and end_odometer
  ),
  add constraint routes_source_check check (
    source in ('MANUAL', 'EXCEL', 'CSV', 'PDF', 'IMAGE')
  ),
  add constraint routes_source_confidence_check check (
    source_confidence is null or (source_confidence >= 0 and source_confidence <= 100)
  ),
  add constraint routes_extreme_km_justification_check check (
    km <= 1500 or char_length(btrim(coalesce(discrepancy_justification, ''))) >= 5
  );

create index if not exists idx_routes_org_date_plate_driver
  on public.routes (organization_id, date desc, plate, driver);
create index if not exists idx_routes_org_source
  on public.routes (organization_id, source, date desc);

create or replace function private.is_manager()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles
    where id = (select auth.uid())
      and role::text in ('SUPER_ADMIN', 'ADMIN')
      and status = 'ACTIVE'
  )
$$;

grant execute on function private.is_manager() to authenticated;

create or replace function private.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_organization_id uuid;
  assigned_role public.app_role := 'USER';
  requested_role text;
begin
  begin
    target_organization_id := nullif(new.raw_app_meta_data ->> 'organization_id', '')::uuid;
  exception when invalid_text_representation then
    target_organization_id := null;
  end;

  if target_organization_id is null then
    select id into target_organization_id
    from public.organizations
    where slug = 'rotaflux'
    limit 1;
  end if;

  requested_role := new.raw_app_meta_data ->> 'role';
  if requested_role in ('SUPER_ADMIN', 'ADMIN') then
    assigned_role := requested_role::public.app_role;
  end if;

  insert into public.profiles (
    id, organization_id, name, email, phone, role, must_change_password, created_by
  ) values (
    new.id,
    target_organization_id,
    coalesce(new.raw_user_meta_data ->> 'name', ''),
    coalesce(new.email, ''),
    nullif(new.raw_user_meta_data ->> 'phone', ''),
    assigned_role,
    coalesce((new.raw_app_meta_data ->> 'must_change_password')::boolean, true),
    nullif(new.raw_app_meta_data ->> 'created_by', '')::uuid
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

drop policy if exists imports_update on public.imports;
drop policy if exists imports_delete on public.imports;
create policy imports_update on public.imports
for update to authenticated
using (
  private.is_super_admin() or
  (private.is_active_user() and organization_id = private.current_organization_id()
    and (private.is_manager() or user_id = (select auth.uid())))
)
with check (
  private.is_super_admin() or
  (organization_id = private.current_organization_id()
    and (private.is_manager() or user_id = (select auth.uid())))
);
create policy imports_delete on public.imports
for delete to authenticated
using (
  private.is_super_admin() or
  (private.is_active_user() and organization_id = private.current_organization_id()
    and (private.is_manager() or user_id = (select auth.uid())))
);

drop policy if exists routes_update on public.routes;
drop policy if exists routes_delete on public.routes;
create policy routes_update on public.routes
for update to authenticated
using (
  private.is_super_admin() or
  (private.is_active_user() and organization_id = private.current_organization_id()
    and (private.is_manager() or user_id = (select auth.uid())))
)
with check (
  private.is_super_admin() or
  (organization_id = private.current_organization_id()
    and (private.is_manager() or user_id = (select auth.uid())))
);
create policy routes_delete on public.routes
for delete to authenticated
using (
  private.is_super_admin() or
  (private.is_active_user() and organization_id = private.current_organization_id()
    and (private.is_manager() or user_id = (select auth.uid())))
);

update storage.buckets
set file_size_limit = 15728640,
    allowed_mime_types = array[
      'text/csv',
      'application/csv',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/pdf',
      'image/jpeg',
      'image/png'
    ]
where id = 'route-imports';

comment on table public.routes is 'Operações diárias canônicas da RotaFlux, com origem manual ou documental.';
comment on table public.imports is 'Documentos de operação com rastreabilidade, revisão e confiança de extração.';
comment on column public.routes.km is 'Quilometragem total; quando há odômetros, deve ser exatamente final menos inicial.';
comment on column public.routes.source is 'Origem da operação: manual, planilha, PDF ou imagem.';
comment on column public.routes.duplicate_override is 'Confirma que uma possível duplicidade foi revisada e aceita.';
