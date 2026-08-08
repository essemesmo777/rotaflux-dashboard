create policy profiles_update_self on public.profiles
for update to authenticated
using (id = (select auth.uid()) and private.is_active_user())
with check (id = (select auth.uid()) and private.is_active_user());

grant update (name, phone, must_change_password, last_login_at) on public.profiles to authenticated;
