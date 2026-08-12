import type { ReactNode } from "react";
import AuthenticatedLayout from "../../components/authenticated-layout";
import { requirePageSession } from "../../lib/server-page-auth";

export default async function ContractsLayout({ children }: { children: ReactNode }) {
  const session = await requirePageSession(["SUPER_ADMIN", "COMPANY_ADMIN"], "/contratos");
  return <AuthenticatedLayout userRole={session.profile.role} userName={session.profile.name} currentPath="/contratos" currentLabel="Contratos" showDashboardBack>{children}</AuthenticatedLayout>;
}
