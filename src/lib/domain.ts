export const APP_NAME = "Priority Handling Logistics, Inc.";

export const APP_ROLES = [
  "EMPLOYEE",
  "SUPERVISOR",
  "DEPARTMENT_HEAD",
  "HR",
  "ADMINISTRATOR",
  "PRESIDENT",
  "REVIEWING_SUPERVISOR",
  "COMMITTEE",
] as const;
export type AppRole = (typeof APP_ROLES)[number];
export type Permission = string;

export const ROLE_LABELS: Record<AppRole, string> = {
  EMPLOYEE: "Employee",
  SUPERVISOR: "Supervisor",
  DEPARTMENT_HEAD: "Department Head",
  HR: "HR Administrator",
  ADMINISTRATOR: "Administrator",
  PRESIDENT: "President",
  REVIEWING_SUPERVISOR: "Reviewing Supervisor",
  COMMITTEE: "Committee",
};

export function normalizeRole(role: string | null | undefined): AppRole | null {
  const normalized = role?.trim().toUpperCase();
  if (normalized === "HR_ADMINISTRATOR") return "HR";
  if (normalized === "DEPT_HEAD") return "DEPARTMENT_HEAD";
  return APP_ROLES.find((candidate) => candidate === normalized) ?? null;
}

export function roleLandingPath(roles: string[]): string {
  const normalized = roles.map(normalizeRole).filter((role): role is AppRole => Boolean(role));
  if (normalized.length !== 1) return "/unauthorized";
  if (normalized.includes("EMPLOYEE")) return "/performance";
  if (normalized.includes("SUPERVISOR")) return "/team";
  if (normalized.includes("DEPARTMENT_HEAD")) return "/department";
  if (normalized.includes("HR")) return "/hr";
  return "/unauthorized";
}
