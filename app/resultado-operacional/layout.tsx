import type { ReactNode } from "react";
import AuthenticatedLayout from "../../components/authenticated-layout";
import { requirePageSession } from "../../lib/server-page-auth";

export default async function OperationalResultsLayout({ children }: { children: ReactNode }) {
  const session = await requirePageSession(["SUPER_ADMIN", "COMPANY_ADMIN"], "/resultado-operacional");
  return <AuthenticatedLayout userRole={session.profile.role} userName={session.profile.name} currentPath="/resultado-operacional" currentLabel="Resultado Operacional" showDashboardBack>{children}</AuthenticatedLayout>;
}
