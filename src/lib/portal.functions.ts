import { createServerFn } from "@tanstack/react-start";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { normalizeRole, type AppRole } from "@/lib/domain";
import type { AdminClient } from "@/lib/server-core.server";

export type PortalEmployeeProfile = {
  id: string;
  employeeNumber: string;
  fullName: string;
  email: string;
  department: string;
  position: string;
  employmentStatus: "ACTIVE" | "INACTIVE";
  hireDate: string | null;
  supervisorName: string | null;
  accountStatus: "Active" | "Inactive" | "Not linked";
};

export type MyPortalProfile = {
  role: AppRole;
  userId: string;
  fullName: string;
  email: string;
  accountStatus: "Active" | "Inactive";
  jobTitle: string | null;
  employee: PortalEmployeeProfile | null;
};

export type SupervisorTeamMember = PortalEmployeeProfile;

async function getAuthorizedRole(
  admin: AdminClient,
  userId: string,
  expectedRole?: AppRole,
): Promise<AppRole> {
  const { data: assignments, error } = await admin
    .from("user_roles")
    .select("role")
    .eq("user_id", userId);
  if (error) throw new Error(`Could not verify account role: ${error.message}`);
  const roles = (assignments ?? []).map((assignment) => normalizeRole(assignment.role));
  if (roles.length !== 1 || roles[0] === null)
    throw new Error("This account must have exactly one Employee or Supervisor role.");
  const role = roles[0];
  if (!role || (expectedRole && role !== expectedRole))
    throw new Error("You are not authorized to access this portal data.");
  return role;
}

function departmentName(division: string, section: string): string {
  return [division, section].filter((part) => part.trim()).join(" / ") || "Not specified";
}

export const getMyPortalProfile = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<MyPortalProfile> => {
    const { getAdmin } = await import("@/lib/server-core.server");
    const admin = await getAdmin();
    const role = await getAuthorizedRole(admin, context.userId);
    const [{ data: user, error: userError }, { data: employee, error: employeeError }] =
      await Promise.all([
        admin
          .from("internal_users")
          .select("id, email, full_name, job_title, is_active, is_locked")
          .eq("id", context.userId)
          .maybeSingle(),
        admin
          .from("employees")
          .select(
            "id, employee_number, full_name, job_title, division, section, employment_status, user_id, hire_date, assigned_supervisor_user_id",
          )
          .eq("user_id", context.userId)
          .maybeSingle(),
      ]);
    if (userError) throw new Error(`Could not load your account profile: ${userError.message}`);
    if (employeeError)
      throw new Error(`Could not load your employee record: ${employeeError.message}`);
    if (!user) throw new Error("Your internal account could not be found.");

    let supervisorName: string | null = null;
    if (employee?.assigned_supervisor_user_id) {
      const { data: supervisor, error } = await admin
        .from("internal_users")
        .select("full_name")
        .eq("id", employee.assigned_supervisor_user_id)
        .maybeSingle();
      if (error) throw new Error(`Could not load your assigned supervisor: ${error.message}`);
      supervisorName = supervisor?.full_name ?? null;
    }

    return {
      role,
      userId: user.id,
      fullName: user.full_name,
      email: user.email,
      accountStatus: user.is_active && !user.is_locked ? "Active" : "Inactive",
      jobTitle: user.job_title,
      employee: employee
        ? {
            id: employee.id,
            employeeNumber: employee.employee_number,
            fullName: employee.full_name,
            email: user.email,
            department: departmentName(employee.division, employee.section),
            position: employee.job_title || user.job_title || "Not specified",
            employmentStatus: employee.employment_status,
            hireDate: employee.hire_date,
            supervisorName,
            accountStatus: user.is_active && !user.is_locked ? "Active" : "Inactive",
          }
        : null,
    };
  });

export const getSupervisorTeam = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<SupervisorTeamMember[]> => {
    const { getAdmin } = await import("@/lib/server-core.server");
    const admin = await getAdmin();
    await getAuthorizedRole(admin, context.userId, "SUPERVISOR");

    const { data: employees, error } = await admin
      .from("employees")
      .select(
        "id, employee_number, full_name, job_title, division, section, employment_status, user_id, hire_date",
      )
      .eq("assigned_supervisor_user_id", context.userId)
      .order("full_name", { ascending: true });
    if (error) throw new Error(`Could not load your assigned team: ${error.message}`);
    if (!employees?.length) return [];

    const linkedUserIds = employees.flatMap((employee) =>
      employee.user_id ? [employee.user_id] : [],
    );
    const linkedUsers = linkedUserIds.length
      ? await admin
          .from("internal_users")
          .select("id, email, is_active, is_locked")
          .in("id", linkedUserIds)
      : { data: [], error: null };
    if (linkedUsers.error)
      throw new Error(`Could not load employee account details: ${linkedUsers.error.message}`);
    const accountById = new Map((linkedUsers.data ?? []).map((user) => [user.id, user]));

    return employees.map((employee) => {
      const linkedUser = employee.user_id ? accountById.get(employee.user_id) : undefined;
      return {
        id: employee.id,
        employeeNumber: employee.employee_number,
        fullName: employee.full_name,
        email: linkedUser?.email ?? "Not linked",
        department: departmentName(employee.division, employee.section),
        position: employee.job_title || "Not specified",
        employmentStatus: employee.employment_status,
        hireDate: employee.hire_date,
        supervisorName: null,
        accountStatus: linkedUser
          ? linkedUser.is_active && !linkedUser.is_locked
            ? "Active"
            : "Inactive"
          : "Not linked",
      };
    });
  });

export const getEmployeeDashboard = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { getAdmin } = await import("@/lib/server-core.server");
    const admin = await getAdmin();
    await getAuthorizedRole(admin, context.userId, "EMPLOYEE");
    return { currentEvaluationAssigned: false };
  });

export const getSupervisorDashboard = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { getAdmin } = await import("@/lib/server-core.server");
    const admin = await getAdmin();
    await getAuthorizedRole(admin, context.userId, "SUPERVISOR");
    const { count, error } = await admin
      .from("employees")
      .select("id", { count: "exact", head: true })
      .eq("assigned_supervisor_user_id", context.userId);
    if (error) throw new Error(`Could not load your team summary: ${error.message}`);
    return {
      assignedEmployees: count ?? 0,
      evaluationMetricsAvailable: false,
    };
  });
