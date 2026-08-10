export type AppRole = "SUPER_ADMIN" | "COMPANY_ADMIN" | "DRIVER";

export type AuthenticatedNavigationItem = {
  href: string;
  label: string;
};

export function homePathForRole(role: AppRole) {
  if (role === "SUPER_ADMIN") return "/admin";
  if (role === "DRIVER") return "/motorista";
  return "/";
}

export function navigationItemsForRole(role: AppRole): AuthenticatedNavigationItem[] {
  if (role === "SUPER_ADMIN") return [{ href: "/admin", label: "Dashboard administrativa" }];
  if (role === "DRIVER") return [{ href: "/motorista", label: "Minhas rotas" }];
  return [
    { href: "/", label: "Dashboard" },
    { href: "/operacoes", label: "Operações" },
    { href: "/usuarios", label: "Motoristas" },
  ];
}
