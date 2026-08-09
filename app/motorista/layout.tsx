import type { ReactNode } from "react";
import { requirePageSession } from "../../lib/server-page-auth";

export default async function DriverLayout({ children }: { children: ReactNode }) {
  await requirePageSession(["DRIVER"]);
  return children;
}
