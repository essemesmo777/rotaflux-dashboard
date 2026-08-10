import type { ReactNode } from "react";
import AuthenticatedLayout from "../../components/authenticated-layout";
import { requirePageSession } from "../../lib/server-page-auth";

export default async function DriverLayout({ children }: { children: ReactNode }) {
  const session = await requirePageSession(["DRIVER"], "/motorista");
  return <AuthenticatedLayout userRole="DRIVER" userName={session.profile.name} currentPath="/motorista" currentLabel="Minhas rotas">{children}</AuthenticatedLayout>;
}
