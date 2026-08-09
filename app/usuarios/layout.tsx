import type { ReactNode } from "react";
import { requirePageSession } from "../../lib/server-page-auth";

export default async function CompanyUsersLayout({ children }: { children: ReactNode }) {
  await requirePageSession(["COMPANY_ADMIN"]);
  return children;
}
