import type { ReactNode } from "react";
import AuthenticatedLayout from "../../components/authenticated-layout";
import { requirePageSession } from "../../lib/server-page-auth";

export default async function AdminLayout({ children }: { children: ReactNode }) {
  const session = await requirePageSession(["SUPER_ADMIN"], "/admin");
  return <AuthenticatedLayout userRole="SUPER_ADMIN" userName={session.profile.name} currentPath="/admin" currentLabel="Administração global">{children}</AuthenticatedLayout>;
}
