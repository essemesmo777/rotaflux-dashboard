import { requirePageSession } from "../lib/server-page-auth";
import LazyFrame from "../components/lazy-frame";

export default async function Home() {
  await requirePageSession(["COMPANY_ADMIN"]);
  return (
    <main className="site-shell">
      <LazyFrame source="/dashboard.html" title="Dashboard RotaFlux" />
    </main>
  );
}
