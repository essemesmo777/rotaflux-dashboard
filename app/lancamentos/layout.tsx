import type { ReactNode } from "react";
import AuthenticatedLayout from "../../components/authenticated-layout";
import { requirePageSession } from "../../lib/server-page-auth";

export default async function RecordsLayout({ children }: { children: ReactNode }) {
  const session = await requirePageSession(["SUPER_ADMIN", "COMPANY_ADMIN"], "/lancamentos");
  return <AuthenticatedLayout userRole={session.profile.role} userName={session.profile.name} currentPath="/lancamentos" currentLabel="Cadastros e Lançamentos" showDashboardBack>{children}</AuthenticatedLayout>;
}
