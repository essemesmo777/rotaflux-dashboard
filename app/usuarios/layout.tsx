import type { ReactNode } from "react";
import AuthenticatedLayout from "../../components/authenticated-layout";
import { requirePageSession } from "../../lib/server-page-auth";

export default async function CompanyUsersLayout({ children }: { children: ReactNode }) {
  const session = await requirePageSession(["COMPANY_ADMIN"], "/usuarios");
  return <AuthenticatedLayout userRole="COMPANY_ADMIN" userName={session.profile.name} currentPath="/usuarios" currentLabel="Motoristas e acessos" showDashboardBack>{children}</AuthenticatedLayout>;
}
