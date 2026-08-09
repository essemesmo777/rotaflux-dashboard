import { requirePageSession } from "../lib/server-page-auth";

export default async function Home() {
  await requirePageSession(["COMPANY_ADMIN"]);
  return (
    <main className="site-shell">
      <iframe className="dashboard-frame" src="/dashboard.html" title="Dashboard RotaFlux" />
    </main>
  );
}
