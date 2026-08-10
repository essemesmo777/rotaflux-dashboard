export type AuthUser = {
  id: string;
  email?: string;
};

export type UserProfile = {
  id: string;
  organization_id: string;
  name: string;
  email: string;
  phone: string | null;
  role: "SUPER_ADMIN" | "COMPANY_ADMIN" | "DRIVER";
  status: "ACTIVE" | "INACTIVE" | "SUSPENDED";
  must_change_password: boolean;
  last_login_at: string | null;
  created_at: string;
  organizations?: {
    id: string;
    name: string;
    status: "ACTIVE" | "INACTIVE" | "SUSPENDED";
    plan: string;
  } | null;
};

export type AppRole = UserProfile["role"];

export { homePathForRole } from "./auth-navigation.ts";

export function canManageCompany(role: AppRole) {
  return role === "SUPER_ADMIN" || role === "COMPANY_ADMIN";
}

export type AuthSession = {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  user: AuthUser;
};

export function getSupabaseConfig() {
  const url = process.env.SUPABASE_URL?.replace(/\/$/, "");
  const publishableKey = process.env.SUPABASE_PUBLISHABLE_KEY;
  if (!url || !publishableKey) throw new Error("A conexão com o Supabase ainda não foi configurada.");
  return { url, publishableKey };
}

export function readCookie(request: Request, name: string) {
  const cookies = request.headers.get("cookie") ?? "";
  const match = cookies.split(";").map((value) => value.trim()).find((value) => value.startsWith(`${name}=`));
  return match ? decodeURIComponent(match.slice(name.length + 1)) : null;
}

function cookieLine(request: Request, name: string, value: string, maxAge: number) {
  const secure = new URL(request.url).protocol === "https:" ? "; Secure" : "";
  return `${name}=${encodeURIComponent(value)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure}`;
}

export function appendSessionCookies(headers: Headers, request: Request, session: AuthSession) {
  headers.append("Set-Cookie", cookieLine(request, "rotaflux_access", session.access_token, session.expires_in || 3600));
  headers.append("Set-Cookie", cookieLine(request, "rotaflux_refresh", session.refresh_token, 60 * 60 * 24 * 30));
}

export function appendClearedSessionCookies(headers: Headers, request: Request) {
  headers.append("Set-Cookie", cookieLine(request, "rotaflux_access", "", 0));
  headers.append("Set-Cookie", cookieLine(request, "rotaflux_refresh", "", 0));
}

export async function supabaseFetch(path: string, options: RequestInit & { token?: string } = {}) {
  const { url, publishableKey } = getSupabaseConfig();
  const headers = new Headers(options.headers);
  headers.set("apikey", publishableKey);
  if (options.token) headers.set("Authorization", `Bearer ${options.token}`);
  return fetch(`${url}${path}`, { ...options, headers });
}

export async function responseError(response: Response, fallback: string) {
  try {
    const payload = (await response.json()) as { message?: string; msg?: string; error?: string; error_description?: string };
    return payload.message || payload.msg || payload.error_description || payload.error || fallback;
  } catch {
    return fallback;
  }
}

export async function getAuthUser(token: string) {
  const response = await supabaseFetch("/auth/v1/user", { token });
  if (!response.ok) return null;
  return (await response.json()) as AuthUser;
}

export async function getUserProfile(token: string, userId: string) {
  const response = await supabaseFetch(
    `/rest/v1/profiles?id=eq.${encodeURIComponent(userId)}&select=id,organization_id,name,email,phone,role,status,must_change_password,last_login_at,created_at,organizations(id,name,status,plan)`,
    { token, headers: { Accept: "application/json" } },
  );
  if (!response.ok) return null;
  const rows = (await response.json()) as UserProfile[];
  return rows[0] ?? null;
}

export async function requireSession(request: Request) {
  const token = readCookie(request, "rotaflux_access");
  if (!token) return null;
  const user = await getAuthUser(token);
  if (!user) return null;
  const profile = await getUserProfile(token, user.id);
  if (!profile || profile.status !== "ACTIVE") return null;
  if (profile.role !== "SUPER_ADMIN" && profile.organizations?.status !== "ACTIVE") return null;
  return { token, user, profile };
}

export async function getAssignableDriver(token: string, organizationId: string, driverId: string) {
  const response = await supabaseFetch(
    `/rest/v1/drivers?id=eq.${encodeURIComponent(driverId)}&organization_id=eq.${encodeURIComponent(organizationId)}&status=eq.ACTIVE&select=id,name,phone,auth_user_id`,
    { token },
  );
  if (!response.ok) return null;
  const rows = (await response.json()) as Array<{ id: string; name: string; phone: string | null; auth_user_id: string | null }>;
  return rows[0] ?? null;
}

export async function getAssignableDriverByAuthUser(token: string, organizationId: string, authUserId: string) {
  const response = await supabaseFetch(
    `/rest/v1/drivers?auth_user_id=eq.${encodeURIComponent(authUserId)}&organization_id=eq.${encodeURIComponent(organizationId)}&status=eq.ACTIVE&select=id,name,phone,auth_user_id`,
    { token },
  );
  if (!response.ok) return null;
  const rows = (await response.json()) as Array<{ id: string; name: string; phone: string | null; auth_user_id: string | null }>;
  return rows[0] ?? null;
}

export async function listAssignableDrivers(token: string, organizationId: string) {
  const response = await supabaseFetch(
    `/rest/v1/drivers?organization_id=eq.${encodeURIComponent(organizationId)}&status=eq.ACTIVE&select=id,name,phone,auth_user_id&order=name`,
    { token },
  );
  if (!response.ok) return [];
  return (await response.json()) as Array<{ id: string; name: string; phone: string | null; auth_user_id: string | null }>;
}
