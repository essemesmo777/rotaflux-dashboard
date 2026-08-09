import type { ReactNode } from "react";
import { requirePageSession } from "../../lib/server-page-auth";

export default async function AdminLayout({ children }: { children: ReactNode }) {
  await requirePageSession(["SUPER_ADMIN"]);
  return children;
}
