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

export type SupervisorEvaluation = {
  id: string;
  employeeId: string;
  employeeNumber: string;
  employeeName: string;
  position: string;
  department: string;
  periodName: string;
  status: string;
  submittedAt: string | null;
  employeeScore: number | null;
  supervisorStatus: string | null;
  supervisorScore: number | null;
};

const SUPERVISOR_REVIEW_STATUSES = [
  "SUBMITTED",
  "PENDING_SUPERVISOR_REVIEW",
  "SUPERVISOR_IN_PROGRESS",
  "RETURNED_BY_DEPARTMENT_HEAD",
  "RETURNED_BY_HR",
  "REOPENED",
];

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

async function loadSupervisorEvaluations(
  admin: AdminClient,
  supervisorUserId: string,
): Promise<SupervisorEvaluation[]> {
  const { data: evaluations, error: evaluationError } = await admin
    .from("employee_evaluations")
    .select(
      "id, employee_id, evaluation_period_id, status, submitted_at, weighted_score, updated_at, assigned_supervisor_user_id, employee_name_snapshot, employee_number_snapshot, job_title_snapshot, department_label_snapshot",
    )
    .eq("assigned_supervisor_user_id", supervisorUserId)
    .order("updated_at", { ascending: false });
  if (evaluationError)
    throw new Error(
      `Could not load your assigned employee evaluations: ${evaluationError.message}`,
    );
  if (!evaluations?.length) return [];
  let visibleEvaluations = evaluations;
  const correctionEvaluations = evaluations.filter((evaluation) =>
    ["RETURNED_BY_HR", "REOPENED"].includes(evaluation.status),
  );
  if (correctionEvaluations.length) {
    const { data: correctionEvents, error: correctionError } = await admin
      .from("performance_workflow_events")
      .select("employee_evaluation_id, responsible_user_id, action, occurred_at")
      .in(
        "employee_evaluation_id",
        correctionEvaluations.map((evaluation) => evaluation.id),
      )
      .in("action", ["HR_RETURNED", "HR_CORRECTION_REASSIGNED", "EVALUATION_REOPENED"])
      .order("occurred_at", { ascending: false });
    if (correctionError)
      throw new Error(
        `Could not verify reviewer correction assignments: ${correctionError.message}`,
      );
    const latestCorrectionByEvaluation = new Map<string, string | null>();
    for (const event of correctionEvents ?? []) {
      if (!latestCorrectionByEvaluation.has(event.employee_evaluation_id))
        latestCorrectionByEvaluation.set(event.employee_evaluation_id, event.responsible_user_id);
    }
    visibleEvaluations = evaluations.filter(
      (evaluation) =>
        !["RETURNED_BY_HR", "REOPENED"].includes(evaluation.status) ||
        latestCorrectionByEvaluation.get(evaluation.id) === supervisorUserId,
    );
  }
  if (!visibleEvaluations.length) return [];

  const employeeIds = [...new Set(visibleEvaluations.map((evaluation) => evaluation.employee_id))];
  const { data: employees, error: employeeError } = await admin
    .from("employees")
    .select("id")
    .in("id", employeeIds);
  if (employeeError)
    throw new Error(`Could not load evaluation employee records: ${employeeError.message}`);

  const periodIds = [
    ...new Set(visibleEvaluations.map((evaluation) => evaluation.evaluation_period_id)),
  ];
  const evaluationIds = visibleEvaluations.map((evaluation) => evaluation.id);
  const [
    { data: periods, error: periodError },
    { data: supervisorEvaluations, error: supervisorError },
  ] = await Promise.all([
    admin.from("evaluation_periods").select("id, name").in("id", periodIds),
    admin
      .from("supervisor_evaluations")
      .select("employee_evaluation_id, status, weighted_score")
      .in("employee_evaluation_id", evaluationIds),
  ]);
  if (periodError)
    throw new Error(`Could not load evaluation period names: ${periodError.message}`);
  if (supervisorError)
    throw new Error(`Could not load supervisor review status: ${supervisorError.message}`);

  const periodById = new Map((periods ?? []).map((period) => [period.id, period.name]));
  const supervisorEvaluationById = new Map(
    (supervisorEvaluations ?? []).map((evaluation) => [
      evaluation.employee_evaluation_id,
      evaluation,
    ]),
  );

  return visibleEvaluations.flatMap((evaluation) => {
    if (!employees?.some((employee) => employee.id === evaluation.employee_id)) return [];
    const supervisorEvaluation = supervisorEvaluationById.get(evaluation.id);
    return [
      {
        id: evaluation.id,
        employeeId: evaluation.employee_id,
        employeeNumber: evaluation.employee_number_snapshot || "Unknown ID",
        employeeName: evaluation.employee_name_snapshot || "Unknown employee",
        position: evaluation.job_title_snapshot || "Not specified",
        department: evaluation.department_label_snapshot || "Not specified",
        periodName: periodById.get(evaluation.evaluation_period_id) ?? "Evaluation period",
        status: evaluation.status,
        submittedAt: evaluation.submitted_at,
        employeeScore: evaluation.weighted_score,
        supervisorStatus: supervisorEvaluation?.status ?? null,
        supervisorScore: supervisorEvaluation?.weighted_score ?? null,
      },
    ];
  });
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
    const { data: employee, error: employeeError } = await admin
      .from("employees")
      .select("id")
      .eq("user_id", context.userId)
      .maybeSingle();
    if (employeeError)
      throw new Error(`Could not load your employee record: ${employeeError.message}`);
    if (!employee) throw new Error("Your account is not linked to an employee record.");
    const { data: evaluation, error: evaluationError } = await admin
      .from("employee_evaluations")
      .select("id, evaluation_period_id, status, weighted_score, submitted_at")
      .eq("employee_id", employee.id)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (evaluationError)
      throw new Error(`Could not load your current evaluation: ${evaluationError.message}`);
    if (!evaluation)
      return {
        currentEvaluationAssigned: false,
        evaluationId: null,
        status: null,
        submissionDeadline: null,
        periodName: null,
        employeeScore: null,
        supervisorStatus: null,
      };
    const [
      { data: period, error: periodError },
      { data: supervisorEvaluation, error: supervisorError },
    ] = await Promise.all([
      admin
        .from("evaluation_periods")
        .select("name, submission_deadline")
        .eq("id", evaluation.evaluation_period_id)
        .maybeSingle(),
      admin
        .from("supervisor_evaluations")
        .select("status")
        .eq("employee_evaluation_id", evaluation.id)
        .maybeSingle(),
    ]);
    if (periodError)
      throw new Error(`Could not load the evaluation deadline: ${periodError.message}`);
    if (supervisorError)
      throw new Error(`Could not load Supervisor review status: ${supervisorError.message}`);
    return {
      currentEvaluationAssigned: true,
      evaluationId: evaluation.id,
      status: evaluation.status,
      submissionDeadline: period?.submission_deadline ?? null,
      periodName: period?.name ?? null,
      employeeScore: evaluation.weighted_score,
      supervisorStatus: supervisorEvaluation?.status ?? null,
    };
  });

export const getSupervisorDashboard = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { getAdmin } = await import("@/lib/server-core.server");
    const admin = await getAdmin();
    await getAuthorizedRole(admin, context.userId, "SUPERVISOR");
    const [teamResult, evaluations] = await Promise.all([
      admin
        .from("employees")
        .select("id", { count: "exact", head: true })
        .eq("assigned_supervisor_user_id", context.userId)
        .eq("employment_status", "ACTIVE"),
      loadSupervisorEvaluations(admin, context.userId),
    ]);
    if (teamResult.error)
      throw new Error(`Could not load your team summary: ${teamResult.error.message}`);
    return {
      assignedEmployees: teamResult.count ?? 0,
      pendingSelfEvaluations: evaluations.filter((evaluation) =>
        ["DRAFT", "IN_PROGRESS"].includes(evaluation.status),
      ).length,
      awaitingSupervisorReview: evaluations.filter((evaluation) =>
        SUPERVISOR_REVIEW_STATUSES.includes(evaluation.status),
      ).length,
      completedEvaluations: evaluations.filter((evaluation) =>
        [
          "COMPLETED",
          "SUPERVISOR_SUBMITTED",
          "PENDING_DEPARTMENT_HEAD_APPROVAL",
          "PENDING_HR_VALIDATION",
          "RETURNED_BY_DEPARTMENT_HEAD",
          "RETURNED_BY_HR",
          "FINALIZED",
        ].includes(evaluation.status),
      ).length,
      evaluations,
    };
  });

export const getSupervisorEvaluations = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<SupervisorEvaluation[]> => {
    const { getAdmin } = await import("@/lib/server-core.server");
    const admin = await getAdmin();
    await getAuthorizedRole(admin, context.userId, "SUPERVISOR");
    return loadSupervisorEvaluations(admin, context.userId);
  });
