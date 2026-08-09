import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { homePathForRole, requireSession, type AppRole } from "./supabase-rest";

export async function requirePageSession(allowedRoles?: AppRole[]) {
  const incoming = await headers();
  const request = new Request("https://rotaflux.local/", {
    headers: { cookie: incoming.get("cookie") ?? "" },
  });
  const session = await requireSession(request);
  if (!session) redirect("/login");
  if (session.profile.must_change_password) redirect("/change-password");
  if (allowedRoles && !allowedRoles.includes(session.profile.role)) {
    redirect(homePathForRole(session.profile.role));
  }
  return session;
}
