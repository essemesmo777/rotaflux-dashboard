import { requirePageSession } from "../../lib/server-page-auth";
import OperationsFrame from "./operations-frame";

export default async function OperationsPage({ searchParams }: { searchParams?: Promise<Record<string, string | string[] | undefined>> }) {
  await requirePageSession(["COMPANY_ADMIN"], "/operacoes");
  const params = await searchParams;
  const tab = typeof params?.tab === "string" ? params.tab : "";
  return <OperationsFrame source={tab ? `/operations.html?tab=${encodeURIComponent(tab)}` : "/operations.html"} />;
}
