import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { getAdmin, hasPermission, requirePermission } from "@/lib/server-core.server";

const cycleSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().trim().min(2).max(120),
  startsOn: z.string().date(),
  endsOn: z.string().date(),
  submissionDeadline: z.string().date().nullable(),
});

const assignSchema = z.object({
  periodId: z.string().uuid(),
  employeeIds: z.array(z.string().uuid()).min(1).max(500),
});

const profileSchema = z.object({
  name: z.string().trim().min(2).max(120),
  description: z.string().max(2000).default(""),
  jobPositionId: z.string().uuid(),
  effectiveFrom: z.string().date(),
  categories: z
    .array(
      z.object({
        name: z.string().trim().min(1).max(120),
        weight: z.number().positive().max(100),
      }),
    )
    .length(8),
});

export type EvaluationCycleRow = {
  id: string;
  name: string;
  startsOn: string;
  endsOn: string;
  submissionDeadline: string | null;
  status: string;
  assignedCount: number;
};

export const getEvaluationCycles = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<EvaluationCycleRow[]> => {
    await requirePermission(context.userId, "performance.cycles.view");
    const admin = await getAdmin();
    const { data: periods, error } = await admin
      .from("evaluation_periods")
      .select("id, name, starts_on, ends_on, submission_deadline, status")
      .order("starts_on", { ascending: false });
    if (error) throw new Error(`Could not load evaluation cycles: ${error.message}`);
    const ids = (periods ?? []).map((period) => period.id);
    const { data: evaluations, error: assignmentError } = ids.length
      ? await admin
          .from("employee_evaluations")
          .select("evaluation_period_id")
          .in("evaluation_period_id", ids)
      : { data: [], error: null };
    if (assignmentError)
      throw new Error(`Could not load cycle assignments: ${assignmentError.message}`);
    const counts = new Map<string, number>();
    for (const row of evaluations ?? [])
      counts.set(row.evaluation_period_id, (counts.get(row.evaluation_period_id) ?? 0) + 1);
    return (periods ?? []).map((period) => ({
      id: period.id,
      name: period.name,
      startsOn: period.starts_on,
      endsOn: period.ends_on,
      submissionDeadline: period.submission_deadline,
      status: period.status,
      assignedCount: counts.get(period.id) ?? 0,
    }));
  });

export const saveEvaluationCycle = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => cycleSchema.parse(input))
  .handler(async ({ context, data }) => {
    const permission = data.id ? "performance.cycles.edit" : "performance.cycles.create";
    await requirePermission(context.userId, permission);
    if (data.endsOn < data.startsOn)
      throw new Error("The cycle end date must be on or after the start date.");
    if (data.submissionDeadline && data.submissionDeadline < data.startsOn)
      throw new Error("The submission deadline cannot be before the cycle start date.");
    const admin = await getAdmin();
    if (data.id) {
      const { data: current, error: currentError } = await admin
        .from("evaluation_periods")
        .select("status")
        .eq("id", data.id)
        .maybeSingle();
      if (currentError) throw new Error(`Could not verify cycle status: ${currentError.message}`);
      if (!current || current.status !== "DRAFT")
        throw new Error("Only draft evaluation cycles can be edited.");
    }
    const payload = {
      name: data.name,
      starts_on: data.startsOn,
      ends_on: data.endsOn,
      submission_deadline: data.submissionDeadline,
    };
    const result = data.id
      ? await admin
          .from("evaluation_periods")
          .update(payload)
          .eq("id", data.id)
          .select("id")
          .single()
      : await admin
          .from("evaluation_periods")
          .insert({ ...payload, created_by: context.userId })
          .select("id")
          .single();
    if (result.error) throw new Error(`Could not save evaluation cycle: ${result.error.message}`);
    return { id: result.data.id };
  });

export const launchEvaluationCycle = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => z.object({ periodId: z.string().uuid() }).parse(input))
  .handler(async ({ context, data }) => {
    await requirePermission(context.userId, "performance.cycles.launch");
    const admin = await getAdmin();
    const { data: period, error: periodError } = await admin
      .from("evaluation_periods")
      .select("id, starts_on, status")
      .eq("id", data.periodId)
      .maybeSingle();
    if (periodError) throw new Error(`Could not load evaluation cycle: ${periodError.message}`);
    if (!period || period.status !== "DRAFT")
      throw new Error("Only a draft evaluation cycle can be launched.");
    const [{ data: employees, error: employeeError }, { data: templates, error: templateError }] =
      await Promise.all([
        admin
          .from("employees")
          .select(
            "id, job_position_id, department_id, assigned_supervisor_user_id, employment_status",
          )
          .eq("employment_status", "ACTIVE"),
        admin
          .from("evaluation_templates")
          .select("id, job_position_id, effective_from, effective_to")
          .eq("status", "ACTIVE")
          .lte("effective_from", period.starts_on),
      ]);
    if (employeeError)
      throw new Error(`Could not load eligible employees: ${employeeError.message}`);
    if (templateError)
      throw new Error(`Could not load active evaluation profiles: ${templateError.message}`);
    if (!employees?.length) throw new Error("There are no active employees to assign.");

    const jobsMissingProfile = employees.filter(
      (employee) =>
        !employee.job_position_id ||
        !(templates ?? []).some(
          (profile) =>
            profile.job_position_id === employee.job_position_id &&
            (!profile.effective_to || profile.effective_to >= period.starts_on),
        ),
    );
    if (jobsMissingProfile.length)
      throw new Error(
        `${jobsMissingProfile.length} active employee(s) have no effective evaluation profile.`,
      );
    const missingSupervisor = employees.filter((employee) => !employee.assigned_supervisor_user_id);
    if (missingSupervisor.length)
      throw new Error(
        `${missingSupervisor.length} active employee(s) have no assigned Supervisor.`,
      );
    const { data: departmentHeads, error: headError } = employees.some(
      (employee) => !employee.department_id,
    )
      ? { data: [], error: null }
      : await admin
          .from("department_head_assignments")
          .select("department_id")
          .eq("is_active", true)
          .in("department_id", [...new Set(employees.map((employee) => employee.department_id!))]);
    if (headError)
      throw new Error(`Could not verify Department Head assignments: ${headError.message}`);
    const departmentsWithHeads = new Set((departmentHeads ?? []).map((head) => head.department_id));
    const departmentsMissingHead = new Set(
      employees
        .filter(
          (employee) =>
            !employee.department_id || !departmentsWithHeads.has(employee.department_id),
        )
        .map((employee) => employee.department_id ?? "unassigned"),
    );
    if (departmentsMissingHead.size)
      throw new Error(
        `${departmentsMissingHead.size} department(s) need a Department Head assignment before launch.`,
      );

    const { data: existing, error: existingError } = await admin
      .from("employee_evaluations")
      .select("employee_id")
      .eq("evaluation_period_id", period.id);
    if (existingError)
      throw new Error(`Could not verify current assignments: ${existingError.message}`);
    const alreadyAssigned = new Set((existing ?? []).map((row) => row.employee_id));
    const assignments = employees
      .filter((employee) => !alreadyAssigned.has(employee.id))
      .map((employee) => {
        const profile = (templates ?? [])
          .filter(
            (item) =>
              item.job_position_id === employee.job_position_id &&
              (!item.effective_to || item.effective_to >= period.starts_on),
          )
          .sort((left, right) => right.effective_from!.localeCompare(left.effective_from!))[0]!;
        return {
          employee_id: employee.id,
          evaluation_period_id: period.id,
          template_id: profile.id,
          assigned_supervisor_user_id: employee.assigned_supervisor_user_id,
          department_id: employee.department_id,
        };
      });

    if (assignments.length) {
      const { error: insertError } = await admin.from("employee_evaluations").insert(assignments);
      if (insertError)
        throw new Error(`Could not create evaluation assignments: ${insertError.message}`);
    }
    const { error: updateError } = await admin
      .from("evaluation_periods")
      .update({ status: "ACTIVE" })
      .eq("id", period.id)
      .eq("status", "DRAFT");
    if (updateError)
      throw new Error(
        `Assignments were created, but the cycle could not be activated: ${updateError.message}`,
      );
    return { assigned: assignments.length, existing: alreadyAssigned.size };
  });

export type AssignmentSetup = {
  periods: Array<{ id: string; name: string; status: string }>;
  employees: Array<{ id: string; name: string; employeeNumber: string; department: string }>;
  assignments: Array<{
    id: string;
    periodId: string;
    employeeName: string;
    employeeNumber: string;
    periodName: string;
    status: string;
  }>;
};

export const getEvaluationAssignmentSetup = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<AssignmentSetup> => {
    await requirePermission(context.userId, "performance.assignments.manage");
    const admin = await getAdmin();
    const [
      { data: periods, error: periodError },
      { data: employees, error: employeeError },
      { data: evaluations, error: evaluationError },
    ] = await Promise.all([
      admin
        .from("evaluation_periods")
        .select("id, name, status")
        .order("starts_on", { ascending: false }),
      admin
        .from("employees")
        .select("id, employee_number, full_name, division, section")
        .eq("employment_status", "ACTIVE")
        .order("full_name"),
      admin
        .from("employee_evaluations")
        .select("id, employee_id, evaluation_period_id, status")
        .order("updated_at", { ascending: false }),
    ]);
    if (periodError) throw new Error(`Could not load assignment cycles: ${periodError.message}`);
    if (employeeError)
      throw new Error(`Could not load eligible employees: ${employeeError.message}`);
    if (evaluationError)
      throw new Error(`Could not load existing assignments: ${evaluationError.message}`);
    const employeeById = new Map((employees ?? []).map((employee) => [employee.id, employee]));
    const periodById = new Map((periods ?? []).map((period) => [period.id, period.name]));
    return {
      periods: periods ?? [],
      employees: (employees ?? []).map((employee) => ({
        id: employee.id,
        name: employee.full_name,
        employeeNumber: employee.employee_number,
        department:
          [employee.division, employee.section].filter(Boolean).join(" / ") || "Not specified",
      })),
      assignments: (evaluations ?? []).flatMap((evaluation) => {
        const employee = employeeById.get(evaluation.employee_id);
        if (!employee) return [];
        return [
          {
            id: evaluation.id,
            periodId: evaluation.evaluation_period_id,
            employeeName: employee.full_name,
            employeeNumber: employee.employee_number,
            periodName: periodById.get(evaluation.evaluation_period_id) ?? "Unknown cycle",
            status: evaluation.status,
          },
        ];
      }),
    };
  });

export type DepartmentHeadSetup = {
  departments: Array<{
    id: string;
    label: string;
    currentHeadId: string | null;
    currentHead: string | null;
  }>;
  departmentHeads: Array<{ id: string; fullName: string; email: string }>;
};

async function requireDepartmentAssignmentManagement(userId: string) {
  if (
    !(await hasPermission(userId, "performance.department_assignments.manage")) &&
    !(await hasPermission(userId, "users.manage"))
  )
    throw new Error("You are not authorized to assign Department Heads.");
}

export const getDepartmentHeadSetup = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<DepartmentHeadSetup> => {
    await requireDepartmentAssignmentManagement(context.userId);
    const admin = await getAdmin();
    const [
      { data: departments, error: departmentError },
      { data: assignments, error: assignmentError },
      { data: roleUsers, error: roleError },
    ] = await Promise.all([
      admin
        .from("performance_departments")
        .select("id, label")
        .eq("is_active", true)
        .order("label"),
      admin
        .from("department_head_assignments")
        .select("department_id, user_id")
        .eq("is_active", true),
      admin.from("user_roles").select("user_id").eq("role", "DEPARTMENT_HEAD"),
    ]);
    if (departmentError)
      throw new Error(`Could not load stable department records: ${departmentError.message}`);
    if (assignmentError)
      throw new Error(`Could not load Department Head assignments: ${assignmentError.message}`);
    if (roleError) throw new Error(`Could not find Department Head accounts: ${roleError.message}`);
    const userIds = [...new Set((roleUsers ?? []).map((assignment) => assignment.user_id))];
    const { data: users, error: userError } = userIds.length
      ? await admin
          .from("internal_users")
          .select("id, full_name, email")
          .in("id", userIds)
          .eq("is_active", true)
          .eq("is_locked", false)
      : { data: [], error: null };
    if (userError)
      throw new Error(`Could not load Department Head account details: ${userError.message}`);
    const currentByDepartment = new Map(
      (assignments ?? []).map((assignment) => [assignment.department_id, assignment.user_id]),
    );
    const userById = new Map((users ?? []).map((user) => [user.id, user]));
    return {
      departments: (departments ?? []).map((department) => {
        const headId = currentByDepartment.get(department.id) ?? null;
        return {
          id: department.id,
          label: department.label,
          currentHeadId: headId,
          currentHead: headId ? (userById.get(headId)?.full_name ?? "Inactive account") : null,
        };
      }),
      departmentHeads: (users ?? []).map((user) => ({
        id: user.id,
        fullName: user.full_name,
        email: user.email,
      })),
    };
  });

export const assignDepartmentHead = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) =>
    z
      .object({ departmentId: z.string().uuid(), departmentHeadUserId: z.string().uuid() })
      .parse(input),
  )
  .handler(async ({ context, data }) => {
    await requireDepartmentAssignmentManagement(context.userId);
    const admin = await getAdmin();
    const { error } = await admin.rpc("assign_performance_department_head", {
      _actor_user_id: context.userId,
      _department_id: data.departmentId,
      _department_head_user_id: data.departmentHeadUserId,
    });
    if (error) throw new Error(`Could not assign Department Head: ${error.message}`);
    return { ok: true };
  });

export const assignEmployeesToCycle = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => assignSchema.parse(input))
  .handler(async ({ context, data }) => {
    await requirePermission(context.userId, "performance.assignments.manage");
    const admin = await getAdmin();
    const [{ data: period, error: periodError }, { data: employees, error: employeeError }] =
      await Promise.all([
        admin
          .from("evaluation_periods")
          .select("id, starts_on, status")
          .eq("id", data.periodId)
          .maybeSingle(),
        admin
          .from("employees")
          .select("id, job_position_id, department_id, assigned_supervisor_user_id")
          .in("id", data.employeeIds)
          .eq("employment_status", "ACTIVE"),
      ]);
    if (periodError) throw new Error(`Could not load the evaluation cycle: ${periodError.message}`);
    if (employeeError)
      throw new Error(`Could not load selected employees: ${employeeError.message}`);
    if (!period || period.status !== "DRAFT")
      throw new Error("Assignments can only be changed before the cycle is launched.");
    if (employees?.length !== data.employeeIds.length)
      throw new Error("One or more selected employees are missing or inactive.");
    const existingResult = await admin
      .from("employee_evaluations")
      .select("employee_id")
      .eq("evaluation_period_id", period.id)
      .in("employee_id", data.employeeIds);
    if (existingResult.error)
      throw new Error(`Could not check existing assignments: ${existingResult.error.message}`);
    const existing = new Set((existingResult.data ?? []).map((row) => row.employee_id));
    const candidates = (employees ?? []).filter((employee) => !existing.has(employee.id));
    if (!candidates.length) return { assigned: 0 };
    if (
      candidates.some(
        (employee) => !employee.job_position_id || !employee.assigned_supervisor_user_id,
      )
    )
      throw new Error(
        "Every selected employee must have an active job profile and assigned Supervisor.",
      );
    const { data: templates, error: templateError } = await admin
      .from("evaluation_templates")
      .select("id, job_position_id, effective_from, effective_to")
      .eq("status", "ACTIVE")
      .lte("effective_from", period.starts_on)
      .in("job_position_id", [...new Set(candidates.map((employee) => employee.job_position_id!))]);
    if (templateError)
      throw new Error(`Could not load evaluation profiles: ${templateError.message}`);
    const assignmentRows = candidates.map((employee) => {
      const template = (templates ?? [])
        .filter(
          (item) =>
            item.job_position_id === employee.job_position_id &&
            (!item.effective_to || item.effective_to >= period.starts_on),
        )
        .sort((left, right) => right.effective_from!.localeCompare(left.effective_from!))[0];
      if (!template)
        throw new Error(`No active evaluation profile is available for employee ${employee.id}.`);
      return {
        employee_id: employee.id,
        evaluation_period_id: period.id,
        template_id: template.id,
        assigned_supervisor_user_id: employee.assigned_supervisor_user_id,
        department_id: employee.department_id,
      };
    });
    const { error } = await admin.from("employee_evaluations").insert(assignmentRows);
    if (error) throw new Error(`Could not create evaluation assignments: ${error.message}`);
    return { assigned: assignmentRows.length };
  });

export type EvaluationProfileRow = {
  id: string;
  name: string;
  version: number;
  status: string;
  effectiveFrom: string | null;
  jobPosition: string;
  categoryCount: number;
  weightTotal: number;
};

export const getEvaluationProfiles = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<EvaluationProfileRow[]> => {
    await requirePermission(context.userId, "performance.profiles.manage");
    const admin = await getAdmin();
    const [{ data: profiles, error }, { data: positions, error: positionError }] =
      await Promise.all([
        admin
          .from("evaluation_templates")
          .select("id, name, version, status, effective_from, job_position_id")
          .order("name"),
        admin.from("job_positions").select("id, name"),
      ]);
    if (error) throw new Error(`Could not load evaluation profiles: ${error.message}`);
    if (positionError) throw new Error(`Could not load job positions: ${positionError.message}`);
    const ids = (profiles ?? []).map((profile) => profile.id);
    const { data: categories, error: categoryError } = ids.length
      ? await admin
          .from("evaluation_template_categories")
          .select("template_id, weight")
          .in("template_id", ids)
      : { data: [], error: null };
    if (categoryError)
      throw new Error(`Could not load evaluation profile categories: ${categoryError.message}`);
    const positionNames = new Map(
      (positions ?? []).map((position) => [position.id, position.name]),
    );
    const stats = new Map<string, { count: number; weight: number }>();
    for (const category of categories ?? []) {
      const current = stats.get(category.template_id) ?? { count: 0, weight: 0 };
      current.count += 1;
      current.weight += Number(category.weight);
      stats.set(category.template_id, current);
    }
    return (profiles ?? []).map((profile) => ({
      id: profile.id,
      name: profile.name,
      version: profile.version,
      status: profile.status,
      effectiveFrom: profile.effective_from,
      jobPosition: profile.job_position_id
        ? (positionNames.get(profile.job_position_id) ?? "Unknown position")
        : "Unassigned position",
      categoryCount: stats.get(profile.id)?.count ?? 0,
      weightTotal: stats.get(profile.id)?.weight ?? 0,
    }));
  });

export const getActiveEvaluationJobPositions = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await requirePermission(context.userId, "performance.profiles.manage");
    const admin = await getAdmin();
    const { data, error } = await admin
      .from("job_positions")
      .select("id, name")
      .eq("is_active", true)
      .order("name");
    if (error) throw new Error(`Could not load active job positions: ${error.message}`);
    return data ?? [];
  });

export const createEvaluationProfile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => profileSchema.parse(input))
  .handler(async ({ context, data }) => {
    await requirePermission(context.userId, "performance.profiles.manage");
    const total = data.categories.reduce((sum, category) => sum + category.weight, 0);
    if (Math.abs(total - 100) >= 0.0001)
      throw new Error("Evaluation profile category weights must total exactly 100%.");
    const admin = await getAdmin();
    const [{ data: position, error: positionError }, { data: versions, error: versionError }] =
      await Promise.all([
        admin
          .from("job_positions")
          .select("id")
          .eq("id", data.jobPositionId)
          .eq("is_active", true)
          .maybeSingle(),
        admin
          .from("evaluation_templates")
          .select("version")
          .eq("job_position_id", data.jobPositionId)
          .order("version", { ascending: false })
          .limit(1),
      ]);
    if (positionError) throw new Error(`Could not verify job position: ${positionError.message}`);
    if (versionError)
      throw new Error(`Could not determine profile version: ${versionError.message}`);
    if (!position) throw new Error("Select an active job position.");
    const version = (versions?.[0]?.version ?? 0) + 1;
    const { data: profile, error } = await admin
      .from("evaluation_templates")
      .insert({
        name: data.name,
        description: data.description,
        job_position_id: data.jobPositionId,
        version,
        effective_from: data.effectiveFrom,
        status: "DRAFT",
        created_by: context.userId,
      })
      .select("id")
      .single();
    if (error) throw new Error(`Could not create evaluation profile: ${error.message}`);
    const categories = data.categories.map((category, index) => ({
      template_id: profile.id,
      name: category.name,
      weight: category.weight,
      position: index + 1,
    }));
    const { error: categoryError } = await admin
      .from("evaluation_template_categories")
      .insert(categories);
    if (categoryError)
      throw new Error(
        `Profile draft was created, but its categories could not be saved: ${categoryError.message}`,
      );
    return { id: profile.id, version };
  });

export const activateEvaluationProfile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) =>
    z.object({ profileId: z.string().uuid(), effectiveFrom: z.string().date() }).parse(input),
  )
  .handler(async ({ context, data }) => {
    await requirePermission(context.userId, "performance.profiles.manage");
    const admin = await getAdmin();
    const { data: profile, error: profileError } = await admin
      .from("evaluation_templates")
      .select("id, status")
      .eq("id", data.profileId)
      .maybeSingle();
    if (profileError) throw new Error(`Could not load evaluation profile: ${profileError.message}`);
    if (!profile || profile.status !== "DRAFT")
      throw new Error("Only a draft evaluation profile can be activated.");
    const { error } = await admin
      .from("evaluation_templates")
      .update({
        status: "ACTIVE",
        effective_from: data.effectiveFrom,
      })
      .eq("id", data.profileId)
      .eq("status", "DRAFT");
    if (error) throw new Error(`Could not activate evaluation profile: ${error.message}`);
    return { ok: true };
  });

export const getPerformanceMonitoring = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await requirePermission(context.userId, "performance.monitoring.view");
    const admin = await getAdmin();
    const [{ data: evaluations, error: evaluationError }, { data: periods, error: periodError }] =
      await Promise.all([
        admin
          .from("employee_evaluations")
          .select("id, evaluation_period_id, status, updated_at")
          .order("updated_at", { ascending: false }),
        admin
          .from("evaluation_periods")
          .select("id, name, status")
          .order("starts_on", { ascending: false }),
      ]);
    if (evaluationError)
      throw new Error(`Could not load performance monitoring data: ${evaluationError.message}`);
    if (periodError)
      throw new Error(`Could not load monitoring cycle names: ${periodError.message}`);
    const statusCounts = new Map<string, number>();
    const periodCounts = new Map<string, number>();
    for (const evaluation of evaluations ?? []) {
      statusCounts.set(evaluation.status, (statusCounts.get(evaluation.status) ?? 0) + 1);
      periodCounts.set(
        evaluation.evaluation_period_id,
        (periodCounts.get(evaluation.evaluation_period_id) ?? 0) + 1,
      );
    }
    return {
      total: evaluations?.length ?? 0,
      statuses: [...statusCounts.entries()]
        .map(([status, count]) => ({ status, count }))
        .sort((left, right) => left.status.localeCompare(right.status)),
      cycles: (periods ?? []).map((period) => ({
        id: period.id,
        name: period.name,
        status: period.status,
        assignmentCount: periodCounts.get(period.id) ?? 0,
      })),
    };
  });
