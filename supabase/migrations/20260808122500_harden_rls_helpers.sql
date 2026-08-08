create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated;

create or replace function private.current_organization_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select organization_id
  from public.profiles
  where id = (select auth.uid()) and status = 'ACTIVE'
  limit 1
$$;

create or replace function private.is_active_user()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles
    where id = (select auth.uid()) and status = 'ACTIVE'
  )
$$;

create or replace function private.is_super_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles
    where id = (select auth.uid()) and role = 'SUPER_ADMIN' and status = 'ACTIVE'
  )
$$;

grant execute on function private.current_organization_id() to authenticated;
grant execute on function private.is_active_user() to authenticated;
grant execute on function private.is_super_admin() to authenticated;

drop policy organizations_select on public.organizations;
create policy organizations_select on public.organizations
for select to authenticated
using (private.is_super_admin() or id = private.current_organization_id());

drop policy profiles_select on public.profiles;
create policy profiles_select on public.profiles
for select to authenticated
using (private.is_super_admin() or id = (select auth.uid()));

drop policy imports_select on public.imports;
drop policy imports_insert on public.imports;
drop policy imports_update on public.imports;
drop policy imports_delete on public.imports;
create policy imports_select on public.imports
for select to authenticated
using (private.is_super_admin() or (private.is_active_user() and organization_id = private.current_organization_id()));
create policy imports_insert on public.imports
for insert to authenticated
with check (
  private.is_super_admin() or
  (private.is_active_user() and organization_id = private.current_organization_id() and user_id = (select auth.uid()))
);
create policy imports_update on public.imports
for update to authenticated
using (private.is_super_admin() or (private.is_active_user() and organization_id = private.current_organization_id()))
with check (private.is_super_admin() or organization_id = private.current_organization_id());
create policy imports_delete on public.imports
for delete to authenticated
using (private.is_super_admin() or (private.is_active_user() and organization_id = private.current_organization_id()));

drop policy routes_select on public.routes;
drop policy routes_insert on public.routes;
drop policy routes_update on public.routes;
drop policy routes_delete on public.routes;
create policy routes_select on public.routes
for select to authenticated
using (private.is_super_admin() or (private.is_active_user() and organization_id = private.current_organization_id()));
create policy routes_insert on public.routes
for insert to authenticated
with check (
  private.is_super_admin() or
  (private.is_active_user() and organization_id = private.current_organization_id() and user_id = (select auth.uid()))
);
create policy routes_update on public.routes
for update to authenticated
using (private.is_super_admin() or (private.is_active_user() and organization_id = private.current_organization_id()))
with check (private.is_super_admin() or organization_id = private.current_organization_id());
create policy routes_delete on public.routes
for delete to authenticated
using (private.is_super_admin() or (private.is_active_user() and organization_id = private.current_organization_id()));

drop policy audit_logs_select on public.audit_logs;
create policy audit_logs_select on public.audit_logs
for select to authenticated
using (private.is_super_admin());

drop policy route_imports_select on storage.objects;
drop policy route_imports_insert on storage.objects;
drop policy route_imports_delete on storage.objects;
create policy route_imports_select on storage.objects
for select to authenticated
using (
  bucket_id = 'route-imports' and
  (private.is_super_admin() or (storage.foldername(name))[1] = private.current_organization_id()::text)
);
create policy route_imports_insert on storage.objects
for insert to authenticated
with check (
  bucket_id = 'route-imports' and
  (private.is_super_admin() or (storage.foldername(name))[1] = private.current_organization_id()::text)
);
create policy route_imports_delete on storage.objects
for delete to authenticated
using (
  bucket_id = 'route-imports' and
  (private.is_super_admin() or (storage.foldername(name))[1] = private.current_organization_id()::text)
);

revoke all on function public.current_organization_id() from public, anon, authenticated;
revoke all on function public.is_active_user() from public, anon, authenticated;
revoke all on function public.is_super_admin() from public, anon, authenticated;
revoke all on function public.handle_new_auth_user() from public, anon, authenticated;

drop function public.current_organization_id();
drop function public.is_active_user();
drop function public.is_super_admin();

alter function public.handle_new_auth_user() set schema private;

create index idx_profiles_created_by on public.profiles (created_by);
create index idx_imports_user_id on public.imports (user_id);
create index idx_routes_user_id on public.routes (user_id);
create index idx_audit_logs_target_user_id on public.audit_logs (target_user_id);
