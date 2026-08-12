import { requirePageSession } from "../lib/server-page-auth";
import OperationalResultsDashboard from "../components/operational-results-dashboard";
import AuthenticatedLayout from "../components/authenticated-layout";

export default async function Home() {
  const session = await requirePageSession(["COMPANY_ADMIN"]);
  return <AuthenticatedLayout userRole={session.profile.role} userName={session.profile.name} currentPath="/" currentLabel="Dashboard"><OperationalResultsDashboard variant="dashboard" /></AuthenticatedLayout>;
}
