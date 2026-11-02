export const APP_NAME = "Priority Handling Logistics, Inc.";

export const APP_ROLES = ["EMPLOYEE", "SUPERVISOR"] as const;
export type AppRole = (typeof APP_ROLES)[number];
export type Permission = string;

export const ROLE_LABELS: Record<AppRole, string> = {
  EMPLOYEE: "Employee",
  SUPERVISOR: "Supervisor",
};

export function normalizeRole(role: string | null | undefined): AppRole | null {
  const normalized = role?.trim().toUpperCase();
  return normalized === "EMPLOYEE" || normalized === "SUPERVISOR" ? normalized : null;
}

export function roleLandingPath(roles: string[]): string {
  const normalized = roles.map(normalizeRole).filter((role): role is AppRole => Boolean(role));
  if (normalized.length !== 1) return "/unauthorized";
  if (normalized.includes("EMPLOYEE")) return "/performance";
  if (normalized.includes("SUPERVISOR")) return "/team";
  return "/unauthorized";
}
