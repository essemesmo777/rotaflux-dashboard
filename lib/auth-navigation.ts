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
  if (role === "SUPER_ADMIN") return [
    { href: "/admin", label: "Dashboard administrativa" },
    { href: "/lancamentos", label: "Cadastros e Lançamentos" },
    { href: "/resultado-operacional", label: "Resultado Operacional" },
    { href: "/contratos", label: "Contratos" },
    { href: "/ajuda", label: "Ajuda / Como usar" },
  ];
  if (role === "DRIVER") return [
    { href: "/motorista", label: "Minhas rotas" },
    { href: "/ajuda", label: "Ajuda / Como usar" },
  ];
  return [
    { href: "/", label: "Dashboard" },
    { href: "/lancamentos", label: "Cadastros e Lançamentos" },
    { href: "/operacoes", label: "Operações" },
    { href: "/resultado-operacional", label: "Resultado Operacional" },
    { href: "/contratos", label: "Contratos" },
    { href: "/usuarios", label: "Motoristas" },
    { href: "/ajuda", label: "Ajuda / Como usar" },
  ];
}
