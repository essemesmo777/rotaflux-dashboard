import AuthenticatedLayout from "../../components/authenticated-layout";
import HelpCenter from "../../components/help-center";
import { requirePageSession } from "../../lib/server-page-auth";

export default async function HelpPage() {
  const session = await requirePageSession(["SUPER_ADMIN", "COMPANY_ADMIN", "DRIVER"], "/ajuda");
  return <AuthenticatedLayout userRole={session.profile.role} userName={session.profile.name} currentPath="/ajuda" currentLabel="Central de Ajuda" showDashboardBack>
    <HelpCenter role={session.profile.role} />
  </AuthenticatedLayout>;
}
