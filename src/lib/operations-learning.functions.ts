import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Tables } from "@/integrations/supabase/types";
import { getAdmin, requirePermission, writeAudit } from "@/lib/server-core.server";

type EmployeeRow = {
  id: string;
  employee_number: string;
  full_name: string;
  job_position_id: string | null;
  job_title: string;
  department_id: string | null;
  employment_status: string;
};

type GapRow = {
  employeeId: string;
  employeeName: string;
  employeeNumber: string;
  position: string;
  departmentId: string | null;
  competencyDefinitionId: string;
  competency: string;
  requirementItemId: string;
  assessmentId: string | null;
  requiredLevel: number;
  currentLevel: number | null;
  gap: number | null;
  mandatory: boolean;
  qualificationMissing: boolean;
  status: "Unassessed" | "Gap" | "Meets requirement";
  nextAssessmentOn: string | null;
};

type AssessmentLevel = {
  id: string;
  employee_id: string;
  competency_definition_id: string;
  assessed_level: number;
  assessed_on: string;
  status: string;
  evidence_validated_by: string | null;
};

export type OperationsWorkspaceData = {
  permissions: { reviewCourses: boolean; approvePlans: boolean };
  gaps: GapRow[];
  competencies: Array<{ id: string; name: string }>;
  positions: Array<{ id: string; name: string }>;
  assessments: AssessmentLevel[];
  courses: Array<Tables<"learning_courses"> & { competencyIds: string[] }>;
  paths: Tables<"learning_paths">[];
  pathCourses: Tables<"learning_path_courses">[];
  quizzes: Tables<"learning_quizzes">[];
  quizAttempts: Tables<"learning_quiz_attempts">[];
  assignments: Array<
    Tables<"learning_assignments"> & { employeeName: string; courseTitle: string }
  >;
  plans: Array<Tables<"development_plans"> & { employeeName: string; competency: string }>;
  recommendations: Array<
    Tables<"operations_ai_recommendations"> & {
      employeeName: string;
      competency: string;
      courseTitle: string | null;
    }
  >;
  sessions: Array<Tables<"training_sessions"> & { courseTitle: string; participantCount: number }>;
  attendance: Array<Tables<"training_attendance"> & { employeeName: string; sessionTitle: string }>;
  reassessments: GapRow[];
};

async function assertOperationsAccess(userId: string, permission = "operations.learning.view") {
  const admin = await getAdmin();
  const { data: role, error: roleError } = await admin
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .maybeSingle();
  if (roleError) throw new Error(`Could not verify Operations Manager role: ${roleError.message}`);
  if (role?.role !== "OPERATIONS_MANAGER")
    throw new Error("Operations Manager role is required for this workspace.");
  await requirePermission(userId, permission);
  return admin;
}

async function validateCurrentGap(
  admin: Awaited<ReturnType<typeof getAdmin>>,
  employeeId: string,
  assessmentId: string,
  requirementItemId: string,
) {
  const { data: assessment, error: assessmentError } = await admin
    .from("competency_assessments")
    .select(
      "id, employee_id, competency_definition_id, assessed_level, assessed_on, version, status",
    )
    .eq("id", assessmentId)
    .maybeSingle();
  if (assessmentError)
    throw new Error(`Could not validate competency assessment: ${assessmentError.message}`);
  const { data: employee, error: employeeError } = await admin
    .from("employees")
    .select("id, job_position_id, employment_status")
    .eq("id", employeeId)
    .maybeSingle();
  if (employeeError) throw new Error(`Could not validate plan employee: ${employeeError.message}`);
  const { data: requirement, error: requirementError } = await admin
    .from("competency_requirement_items")
    .select("id, requirement_set_id, competency_definition_id, required_level")
    .eq("id", requirementItemId)
    .maybeSingle();
  if (requirementError)
    throw new Error(`Could not validate competency requirement: ${requirementError.message}`);
  if (
    !assessment ||
    !employee ||
    employee.employment_status !== "ACTIVE" ||
    !employee.job_position_id ||
    !requirement ||
    assessment.status !== "APPROVED" ||
    assessment.employee_id !== employeeId ||
    assessment.competency_definition_id !== requirement.competency_definition_id
  )
    throw new Error("The selected employee, approved assessment, and requirement do not match.");
  const today = new Date().toISOString().slice(0, 10);
  const { data: activeSets, error: setError } = await admin
    .from("competency_requirement_sets")
    .select("id, version")
    .eq("job_position_id", employee.job_position_id)
    .eq("status", "APPROVED")
    .lte("effective_from", today)
    .order("version", { ascending: false })
    .limit(1);
  if (setError) throw new Error(`Could not load active requirement version: ${setError.message}`);
  if (!activeSets?.[0] || activeSets[0].id !== requirement.requirement_set_id)
    throw new Error(
      "Development plans must link to the current approved requirement version for the employee's position.",
    );
  const { data: latest, error: latestError } = await admin
    .from("competency_assessments")
    .select("id, assessed_level, assessed_on, version")
    .eq("employee_id", employeeId)
    .eq("competency_definition_id", assessment.competency_definition_id)
    .eq("status", "APPROVED")
    .order("assessed_on", { ascending: false })
    .order("version", { ascending: false })
    .limit(1);
  if (latestError)
    throw new Error(`Could not load latest approved assessment: ${latestError.message}`);
  if (!latest?.[0] || latest[0].id !== assessment.id)
    throw new Error("This assessment is not the employee's latest approved competency result.");
  if (assessment.assessed_level >= requirement.required_level)
    throw new Error("The selected current approved assessment has no unresolved numeric gap.");
  return { assessment, requirement };
}

export const getOperationsWorkspace = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<OperationsWorkspaceData> => {
    const admin = await assertOperationsAccess(context.userId);
    const [
      positionsResult,
      definitionsResult,
      requirementSetsResult,
      requirementItemsResult,
      assessmentsResult,
      coursesResult,
      courseCompetenciesResult,
      pathsResult,
      pathCoursesResult,
      quizzesResult,
      attemptsResult,
      assignmentsResult,
      plansResult,
      recommendationsResult,
      sessionsResult,
      attendanceResult,
      reviewCoursePermission,
      approvePlanPermission,
    ] = await Promise.all([
      admin.from("job_positions").select("id, name"),
      admin.from("competency_definitions").select("id, code, name, active").eq("active", true),
      admin
        .from("competency_requirement_sets")
        .select("id, job_position_id, version, effective_from")
        .eq("status", "APPROVED")
        .lte("effective_from", new Date().toISOString().slice(0, 10)),
      admin
        .from("competency_requirement_items")
        .select(
          "id, requirement_set_id, competency_definition_id, required_level, mandatory_qualification, qualification_label",
        ),
      admin
        .from("competency_assessments")
        .select(
          "id, employee_id, competency_definition_id, assessed_level, assessed_on, next_assessment_on, status, version, evidence_validated_by",
        )
        .eq("status", "APPROVED"),
      admin.from("learning_courses").select("*").order("updated_at", { ascending: false }),
      admin.from("learning_course_competencies").select("course_id, competency_definition_id"),
      admin.from("learning_paths").select("*").order("created_at", { ascending: false }),
      admin.from("learning_path_courses").select("*").order("sequence_number"),
      admin.from("learning_quizzes").select("*").order("created_at", { ascending: false }),
      admin.from("learning_quiz_attempts").select("*").order("submitted_at", { ascending: false }),
      admin.from("learning_assignments").select("*").order("assigned_at", { ascending: false }),
      admin.from("development_plans").select("*").order("created_at", { ascending: false }),
      admin
        .from("operations_ai_recommendations")
        .select("*")
        .order("created_at", { ascending: false }),
      admin.from("training_sessions").select("*").order("starts_at"),
      admin.from("training_attendance").select("*").order("created_at", { ascending: false }),
      admin.rpc("has_permission", {
        _user_id: context.userId,
        _permission: "operations.learning.review",
      }),
      admin.rpc("has_permission", {
        _user_id: context.userId,
        _permission: "operations.plans.approve",
      }),
    ]);
    const positionIds = [
      ...new Set((requirementSetsResult.data ?? []).map((set) => set.job_position_id)),
    ];
    const employeesResult = positionIds.length
      ? await admin
          .from("employees")
          .select(
            "id, employee_number, full_name, job_position_id, job_title, department_id, employment_status",
          )
          .eq("employment_status", "ACTIVE")
          .in("job_position_id", positionIds)
      : { data: [], error: null };
    const queryErrors = [
      employeesResult.error,
      positionsResult.error,
      definitionsResult.error,
      requirementSetsResult.error,
      requirementItemsResult.error,
      assessmentsResult.error,
      coursesResult.error,
      courseCompetenciesResult.error,
      pathsResult.error,
      pathCoursesResult.error,
      quizzesResult.error,
      attemptsResult.error,
      assignmentsResult.error,
      plansResult.error,
      recommendationsResult.error,
      sessionsResult.error,
      attendanceResult.error,
      reviewCoursePermission.error,
      approvePlanPermission.error,
    ].filter((error) => error !== null);
    if (queryErrors.length)
      throw new Error(`Could not load learning and training workspace: ${queryErrors[0]?.message}`);

    const employees = (employeesResult.data ?? []) as EmployeeRow[];
    const employeeById = new Map(employees.map((employee) => [employee.id, employee]));
    const positionById = new Map(
      (positionsResult.data ?? []).map((position) => [position.id, position.name]),
    );
    const competencyById = new Map(
      (definitionsResult.data ?? []).map((definition) => [definition.id, definition.name]),
    );
    const courseById = new Map((coursesResult.data ?? []).map((course) => [course.id, course]));
    const effectiveSets = new Map<string, { id: string; version: number }>();
    for (const set of [...(requirementSetsResult.data ?? [])].sort(
      (a, b) => b.version - a.version,
    )) {
      if (!effectiveSets.has(set.job_position_id)) effectiveSets.set(set.job_position_id, set);
    }
    const latestAssessment = new Map<string, NonNullable<typeof assessmentsResult.data>[number]>();
    for (const assessment of [...(assessmentsResult.data ?? [])].sort(
      (a, b) => a.assessed_on.localeCompare(b.assessed_on) || a.version - b.version,
    ))
      latestAssessment.set(
        `${assessment.employee_id}:${assessment.competency_definition_id}`,
        assessment,
      );
    const gapRows: GapRow[] = [];
    for (const employee of employees) {
      if (!employee.job_position_id) continue;
      const activeSet = effectiveSets.get(employee.job_position_id);
      if (!activeSet) continue;
      for (const item of (requirementItemsResult.data ?? []).filter(
        (row) => row.requirement_set_id === activeSet.id,
      )) {
        const assessment = latestAssessment.get(`${employee.id}:${item.competency_definition_id}`);
        const currentLevel = assessment?.assessed_level ?? null;
        const gap = currentLevel === null ? null : Math.max(0, item.required_level - currentLevel);
        const qualificationMissing = item.mandatory_qualification && currentLevel === null;
        gapRows.push({
          employeeId: employee.id,
          employeeName: employee.full_name,
          employeeNumber: employee.employee_number,
          position: positionById.get(employee.job_position_id) ?? employee.job_title,
          departmentId: employee.department_id,
          competencyDefinitionId: item.competency_definition_id,
          competency: competencyById.get(item.competency_definition_id) ?? "Competency",
          requirementItemId: item.id,
          assessmentId: assessment?.id ?? null,
          requiredLevel: item.required_level,
          currentLevel,
          gap,
          mandatory: item.mandatory_qualification,
          qualificationMissing,
          status:
            currentLevel === null ? "Unassessed" : gap && gap > 0 ? "Gap" : "Meets requirement",
          nextAssessmentOn: assessment?.next_assessment_on ?? null,
        });
      }
    }
    const courseCompetencies = courseCompetenciesResult.data ?? [];
    const courses = (coursesResult.data ?? []).map((course) => ({
      ...course,
      competencyIds: courseCompetencies
        .filter((mapping) => mapping.course_id === course.id)
        .map((mapping) => mapping.competency_definition_id),
    }));
    const assignments = (assignmentsResult.data ?? []).map((assignment) => ({
      ...assignment,
      employeeName:
        employeeById.get(assignment.employee_id)?.full_name ?? "Employee outside current scope",
      courseTitle: courseById.get(assignment.course_id)?.title ?? "Course",
    }));
    const plans = (plansResult.data ?? []).map((plan) => ({
      ...plan,
      employeeName:
        employeeById.get(plan.employee_id)?.full_name ?? "Employee outside current scope",
      competency:
        gapRows.find((gap) => gap.requirementItemId === plan.requirement_item_id)?.competency ??
        "Competency",
    }));
    const recommendations = (recommendationsResult.data ?? []).map((recommendation) => ({
      ...recommendation,
      employeeName:
        employeeById.get(recommendation.employee_id)?.full_name ?? "Employee outside current scope",
      competency:
        gapRows.find((gap) => gap.requirementItemId === recommendation.requirement_item_id)
          ?.competency ?? "Competency",
      courseTitle: recommendation.mapped_course_id
        ? (courseById.get(recommendation.mapped_course_id)?.title ?? null)
        : null,
    }));
    const sessions = (sessionsResult.data ?? []).map((session) => ({
      ...session,
      courseTitle: session.course_id
        ? (courseById.get(session.course_id)?.title ?? session.title)
        : session.title,
      participantCount: (attendanceResult.data ?? []).filter(
        (attendee) => attendee.session_id === session.id,
      ).length,
    }));
    const attendance = (attendanceResult.data ?? []).map((row) => ({
      ...row,
      employeeName:
        employeeById.get(row.employee_id)?.full_name ?? "Employee outside current scope",
      sessionTitle:
        sessionsResult.data?.find((session) => session.id === row.session_id)?.title ??
        "Training session",
    }));
    const today = new Date().toISOString().slice(0, 10);
    const reassessments = gapRows.filter(
      (gap) => gap.nextAssessmentOn && gap.nextAssessmentOn <= today,
    );
    return {
      permissions: {
        reviewCourses: reviewCoursePermission.data === true,
        approvePlans: approvePlanPermission.data === true,
      },
      gaps: gapRows,
      competencies: (definitionsResult.data ?? []).map((definition) => ({
        id: definition.id,
        name: definition.name,
      })),
      positions: positionsResult.data ?? [],
      assessments: (assessmentsResult.data ?? []).map((assessment) => ({
        id: assessment.id,
        employee_id: assessment.employee_id,
        competency_definition_id: assessment.competency_definition_id,
        assessed_level: assessment.assessed_level,
        assessed_on: assessment.assessed_on,
        status: assessment.status,
        evidence_validated_by: assessment.evidence_validated_by,
      })),
      courses,
      paths: pathsResult.data ?? [],
      pathCourses: pathCoursesResult.data ?? [],
      quizzes: quizzesResult.data ?? [],
      quizAttempts: attemptsResult.data ?? [],
      assignments,
      plans,
      recommendations,
      sessions,
      attendance,
      reassessments,
    };
  });

const courseInput = z.object({
  code: z.string().trim().min(2).max(40),
  title: z.string().trim().min(2).max(160),
  description: z.string().trim().max(4000),
  category: z.string().trim().max(80),
  format: z.enum(["SELF_PACED", "INSTRUCTOR_LED", "PRACTICAL", "BLENDED"]),
  durationMinutes: z.number().int().min(0).max(100000),
  targetRoles: z.array(z.string().trim().min(2).max(100)).max(30),
  objectives: z.array(z.string().trim().min(2)).max(20),
  content: z.string().trim().min(10).max(20000),
  prerequisites: z.array(z.string().trim().min(2).max(80)).max(20),
  completionCriteria: z.string().trim().min(2).max(1000),
  reviewDueOn: z.string().date().nullable(),
  versionNotes: z.string().trim().max(1000),
  competencyIds: z.array(z.string().uuid()).min(1).max(50),
});

export const createLearningCourse = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(courseInput)
  .handler(async ({ context, data }) => {
    const admin = await assertOperationsAccess(context.userId, "operations.learning.manage");
    const { data: defs, error: definitionError } = await admin
      .from("competency_definitions")
      .select("id")
      .in("id", data.competencyIds)
      .eq("active", true);
    if (definitionError)
      throw new Error(`Could not validate course competencies: ${definitionError.message}`);
    if (defs?.length !== data.competencyIds.length)
      throw new Error("Every course must map to existing active competencies.");
    const { data: priorVersions, error: versionError } = await admin
      .from("learning_courses")
      .select("version")
      .eq("code", data.code.toUpperCase())
      .order("version", { ascending: false })
      .limit(1);
    if (versionError)
      throw new Error(`Could not load existing course version: ${versionError.message}`);
    const { data: course, error } = await admin
      .from("learning_courses")
      .insert({
        code: data.code.toUpperCase(),
        version: (priorVersions?.[0]?.version ?? 0) + 1,
        title: data.title,
        description: data.description,
        category: data.category,
        format: data.format,
        duration_minutes: data.durationMinutes,
        target_roles: data.targetRoles,
        objectives: data.objectives,
        content_blocks: [{ title: data.title, content: data.content }],
        prerequisites: data.prerequisites,
        completion_criteria: data.completionCriteria,
        review_due_on: data.reviewDueOn,
        version_notes: data.versionNotes,
        status: "DRAFT",
        created_by: context.userId,
      })
      .select("id")
      .single();
    if (error) throw new Error(`Could not create course: ${error.message}`);
    const { error: mappingError } = await admin.from("learning_course_competencies").insert(
      data.competencyIds.map((competency_definition_id) => ({
        course_id: course.id,
        competency_definition_id,
      })),
    );
    if (mappingError)
      throw new Error(`Course was created but competency mapping failed: ${mappingError.message}`);
    await writeAudit({
      actorUserId: context.userId,
      action: "LEARNING_COURSE_CREATED",
      module: "Learning",
      entityType: "learning_course",
      entityId: course.id,
    });
    return { id: course.id };
  });

export const reviewLearningCourse = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ id: z.string().uuid(), publish: z.boolean() }))
  .handler(async ({ context, data }) => {
    const admin = await assertOperationsAccess(context.userId, "operations.learning.review");
    const { error } = await admin
      .from("learning_courses")
      .update({
        status: data.publish ? "PUBLISHED" : "ARCHIVED",
        reviewed_by: context.userId,
        reviewed_at: new Date().toISOString(),
      })
      .eq("id", data.id)
      .eq("status", "PENDING_REVIEW");
    if (error) throw new Error(`Could not review course: ${error.message}`);
    await writeAudit({
      actorUserId: context.userId,
      action: data.publish ? "LEARNING_COURSE_PUBLISHED" : "LEARNING_COURSE_ARCHIVED",
      module: "Learning",
      entityType: "learning_course",
      entityId: data.id,
    });
  });

export const submitLearningCourseForReview = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ id: z.string().uuid() }))
  .handler(async ({ context, data }) => {
    const admin = await assertOperationsAccess(context.userId, "operations.learning.manage");
    const { error } = await admin
      .from("learning_courses")
      .update({ status: "PENDING_REVIEW" })
      .eq("id", data.id)
      .eq("created_by", context.userId)
      .eq("status", "DRAFT");
    if (error) throw new Error(`Could not submit course for review: ${error.message}`);
    await writeAudit({
      actorUserId: context.userId,
      action: "LEARNING_COURSE_SUBMITTED_FOR_REVIEW",
      module: "Learning",
      entityType: "learning_course",
      entityId: data.id,
    });
  });

const pathInput = z.object({
  name: z.string().trim().min(2).max(160),
  description: z.string().trim().max(2000),
  targetJobPositionId: z.string().uuid().nullable(),
  courseIds: z.array(z.string().uuid()).min(1).max(50),
});
export const createLearningPath = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(pathInput)
  .handler(async ({ context, data }) => {
    const admin = await assertOperationsAccess(context.userId, "operations.learning.manage");
    const { data: courses, error: courseError } = await admin
      .from("learning_courses")
      .select("id")
      .in("id", data.courseIds)
      .eq("status", "PUBLISHED");
    if (courseError) throw new Error(`Could not validate path courses: ${courseError.message}`);
    if (courses?.length !== data.courseIds.length)
      throw new Error("Learning paths can include only published courses.");
    const { data: path, error } = await admin
      .from("learning_paths")
      .insert({
        name: data.name,
        description: data.description,
        target_job_position_id: data.targetJobPositionId,
        version: 1,
        status: "DRAFT",
        created_by: context.userId,
      })
      .select("id")
      .single();
    if (error) throw new Error(`Could not create learning path: ${error.message}`);
    const { error: itemsError } = await admin.from("learning_path_courses").insert(
      data.courseIds.map((course_id, index) => ({
        path_id: path.id,
        course_id,
        sequence_number: index + 1,
        required: true,
      })),
    );
    if (itemsError)
      throw new Error(
        `Learning path was created but its sequence could not be saved: ${itemsError.message}`,
      );
    await writeAudit({
      actorUserId: context.userId,
      action: "LEARNING_PATH_CREATED",
      module: "Learning",
      entityType: "learning_path",
      entityId: path.id,
    });
    return { id: path.id };
  });

export const publishLearningPath = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ id: z.string().uuid() }))
  .handler(async ({ context, data }) => {
    const admin = await assertOperationsAccess(context.userId, "operations.learning.manage");
    const { error } = await admin
      .from("learning_paths")
      .update({ status: "PUBLISHED" })
      .eq("id", data.id)
      .eq("status", "DRAFT");
    if (error) throw new Error(`Could not publish learning path: ${error.message}`);
    await writeAudit({
      actorUserId: context.userId,
      action: "LEARNING_PATH_PUBLISHED",
      module: "Learning",
      entityType: "learning_path",
      entityId: data.id,
    });
  });

export const createLearningQuiz = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    z.object({
      courseId: z.string().uuid(),
      title: z.string().trim().min(2).max(160),
      passThreshold: z.number().min(0).max(100),
      attemptLimit: z.number().int().min(1).max(20),
      questions: z
        .array(
          z.object({
            prompt: z.string().trim().min(3),
            options: z.array(z.string().trim().min(1)).min(2).max(10),
            correctOption: z.number().int().min(0).max(9),
            points: z.number().positive(),
          }),
        )
        .min(1)
        .max(100),
    }),
  )
  .handler(async ({ context, data }) => {
    const admin = await assertOperationsAccess(context.userId, "operations.learning.manage");
    const { data: course, error: courseError } = await admin
      .from("learning_courses")
      .select("id")
      .eq("id", data.courseId)
      .maybeSingle();
    if (courseError) throw new Error(`Could not verify quiz course: ${courseError.message}`);
    if (!course) throw new Error("Select an existing course for this quiz.");
    const { error } = await admin.from("learning_quizzes").insert({
      course_id: data.courseId,
      version: 1,
      title: data.title,
      pass_threshold: data.passThreshold,
      attempt_limit: data.attemptLimit,
      questions: data.questions,
      status: "DRAFT",
      created_by: context.userId,
    });
    if (error) throw new Error(`Could not create quiz: ${error.message}`);
    await writeAudit({
      actorUserId: context.userId,
      action: "LEARNING_QUIZ_CREATED",
      module: "Learning",
      entityType: "learning_quiz",
    });
  });

export const publishLearningQuiz = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ id: z.string().uuid() }))
  .handler(async ({ context, data }) => {
    const admin = await assertOperationsAccess(context.userId, "operations.learning.manage");
    const { error } = await admin
      .from("learning_quizzes")
      .update({ status: "PUBLISHED" })
      .eq("id", data.id)
      .eq("status", "DRAFT");
    if (error) throw new Error(`Could not publish quiz: ${error.message}`);
    await writeAudit({
      actorUserId: context.userId,
      action: "LEARNING_QUIZ_PUBLISHED",
      module: "Learning",
      entityType: "learning_quiz",
      entityId: data.id,
    });
  });

export const createDevelopmentPlan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    z.object({
      employeeId: z.string().uuid(),
      assessmentId: z.string().uuid(),
      requirementItemId: z.string().uuid(),
      title: z.string().trim().min(2).max(160),
      activityType: z.string().trim().min(2).max(80),
      activityDescription: z.string().trim().min(5).max(3000),
      successCriteria: z.string().trim().min(5).max(1000),
      targetDate: z.string().date().nullable(),
      ownerUserId: z.string().uuid().nullable(),
      recommendationId: z.string().uuid().nullable(),
    }),
  )
  .handler(async ({ context, data }) => {
    const admin = await assertOperationsAccess(context.userId, "operations.learning.manage");
    const { assessment } = await validateCurrentGap(
      admin,
      data.employeeId,
      data.assessmentId,
      data.requirementItemId,
    );
    if (data.recommendationId) {
      const { data: recommendation, error } = await admin
        .from("operations_ai_recommendations")
        .select("id, assessment_id, requirement_item_id, status")
        .eq("id", data.recommendationId)
        .maybeSingle();
      if (error) throw new Error(`Could not verify recommendation: ${error.message}`);
      if (
        !recommendation ||
        recommendation.assessment_id !== data.assessmentId ||
        recommendation.requirement_item_id !== data.requirementItemId ||
        recommendation.status !== "PENDING_REVIEW"
      )
        throw new Error("The recommendation is not available for conversion into this plan.");
    }
    const { data: plan, error } = await admin
      .from("development_plans")
      .insert({
        employee_id: assessment.employee_id,
        assessment_id: data.assessmentId,
        requirement_item_id: data.requirementItemId,
        recommendation_id: data.recommendationId,
        title: data.title,
        activity_type: data.activityType,
        activity_description: data.activityDescription,
        success_criteria: data.successCriteria,
        target_date: data.targetDate,
        owner_user_id: data.ownerUserId,
        created_by: context.userId,
        status: "DRAFT",
      })
      .select("id")
      .single();
    if (error) throw new Error(`Could not create development plan: ${error.message}`);
    if (data.recommendationId) {
      const { error: decisionError } = await admin
        .from("operations_ai_recommendations")
        .update({
          status: "CONVERTED",
          reviewer_user_id: context.userId,
          reviewer_decision: "ACCEPTED",
          reviewed_at: new Date().toISOString(),
        })
        .eq("id", data.recommendationId)
        .eq("status", "PENDING_REVIEW");
      if (decisionError)
        throw new Error(
          `Plan created but recommendation conversion needs attention: ${decisionError.message}`,
        );
    }
    await writeAudit({
      actorUserId: context.userId,
      action: "DEVELOPMENT_PLAN_CREATED",
      module: "Training",
      entityType: "development_plan",
      entityId: plan.id,
    });
    return { id: plan.id };
  });

export const submitDevelopmentPlan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ id: z.string().uuid() }))
  .handler(async ({ context, data }) => {
    const admin = await assertOperationsAccess(context.userId, "operations.learning.manage");
    const { data: currentPlan, error: currentPlanError } = await admin
      .from("development_plans")
      .select("id, created_by, status")
      .eq("id", data.id)
      .maybeSingle();
    if (currentPlanError)
      throw new Error(`Could not load plan before submission: ${currentPlanError.message}`);
    if (!currentPlan || currentPlan.created_by !== context.userId || currentPlan.status !== "DRAFT")
      throw new Error("Only the plan author may submit a draft plan.");
    const { data: updated, error } = await admin
      .from("development_plans")
      .update({ status: "PENDING_APPROVAL" })
      .eq("id", data.id)
      .eq("created_by", context.userId)
      .eq("status", "DRAFT")
      .select("id")
      .maybeSingle();
    if (error) throw new Error(`Could not submit development plan: ${error.message}`);
    if (!updated)
      throw new Error("The plan changed before it could be submitted. Reload and retry.");
    await writeAudit({
      actorUserId: context.userId,
      action: "DEVELOPMENT_PLAN_SUBMITTED",
      module: "Training",
      entityType: "development_plan",
      entityId: data.id,
    });
  });

export const decideDevelopmentPlan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    z.object({
      id: z.string().uuid(),
      approve: z.boolean(),
      reason: z.string().trim().min(3).max(2000),
    }),
  )
  .handler(async ({ context, data }) => {
    const admin = await getAdmin();
    await requirePermission(context.userId, "operations.plans.approve");
    const { data: plan, error: planError } = await admin
      .from("development_plans")
      .select("id, created_by, status")
      .eq("id", data.id)
      .maybeSingle();
    if (planError) throw new Error(`Could not load plan for approval: ${planError.message}`);
    if (!plan || plan.status !== "PENDING_APPROVAL")
      throw new Error("This plan is no longer awaiting approval.");
    if (plan.created_by === context.userId)
      throw new Error("A plan author cannot approve their own development plan.");
    const { data: updated, error } = await admin
      .from("development_plans")
      .update({
        status: data.approve ? "APPROVED" : "RETURNED",
        approval_user_id: data.approve ? context.userId : null,
        approved_at: data.approve ? new Date().toISOString() : null,
        decision_reason: data.reason,
      })
      .eq("id", data.id)
      .eq("status", "PENDING_APPROVAL")
      .select("id")
      .maybeSingle();
    if (error) throw new Error(`Could not record development plan decision: ${error.message}`);
    if (!updated)
      throw new Error("This plan was updated by another reviewer. Reload and try again.");
    await writeAudit({
      actorUserId: context.userId,
      action: data.approve ? "DEVELOPMENT_PLAN_APPROVED" : "DEVELOPMENT_PLAN_RETURNED",
      module: "Training",
      entityType: "development_plan",
      entityId: data.id,
      reason: data.reason,
    });
  });

export const assignLearningCourse = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    z.object({
      employeeId: z.string().uuid(),
      courseId: z.string().uuid(),
      planId: z.string().uuid(),
      dueAt: z.string().date().nullable(),
    }),
  )
  .handler(async ({ context, data }) => {
    const admin = await assertOperationsAccess(context.userId, "operations.learning.manage");
    const { data: plan, error: planError } = await admin
      .from("development_plans")
      .select("id, employee_id, status, requirement_item_id, assessment_id")
      .eq("id", data.planId)
      .maybeSingle();
    if (planError) throw new Error(`Could not validate development plan: ${planError.message}`);
    if (
      !plan ||
      plan.employee_id !== data.employeeId ||
      !["APPROVED", "ACTIVE"].includes(plan.status)
    )
      throw new Error(
        "Learning may only be assigned to the employee on an approved development plan.",
      );
    await validateCurrentGap(admin, plan.employee_id, plan.assessment_id, plan.requirement_item_id);
    const { data: requirement, error: requirementError } = await admin
      .from("competency_requirement_items")
      .select("competency_definition_id")
      .eq("id", plan.requirement_item_id)
      .maybeSingle();
    if (requirementError)
      throw new Error(`Could not validate plan requirement: ${requirementError.message}`);
    if (!requirement) throw new Error("The development plan has no valid competency requirement.");
    const { data: course, error: courseError } = await admin
      .from("learning_courses")
      .select("id, status")
      .eq("id", data.courseId)
      .maybeSingle();
    if (courseError) throw new Error(`Could not validate course: ${courseError.message}`);
    if (!course || course.status !== "PUBLISHED")
      throw new Error("Only published courses may be assigned.");
    const { data: mapping, error: mappingError } = await admin
      .from("learning_course_competencies")
      .select("competency_definition_id")
      .eq("course_id", data.courseId)
      .eq("competency_definition_id", requirement.competency_definition_id);
    if (mappingError)
      throw new Error(`Could not verify course-to-gap mapping: ${mappingError.message}`);
    if (!mapping?.length)
      throw new Error("Choose a course mapped to the competency gap linked to this plan.");
    const { error } = await admin.from("learning_assignments").insert({
      employee_id: data.employeeId,
      course_id: data.courseId,
      plan_id: data.planId,
      assigned_by: context.userId,
      due_at: data.dueAt,
      status: "ASSIGNED",
      progress_percent: 0,
    });
    if (error) throw new Error(`Could not assign course: ${error.message}`);
    const { error: activateError } = await admin
      .from("development_plans")
      .update({ status: "ACTIVE" })
      .eq("id", data.planId)
      .eq("status", "APPROVED");
    if (activateError)
      throw new Error(`Course assigned, but plan activation failed: ${activateError.message}`);
    await writeAudit({
      actorUserId: context.userId,
      action: "LEARNING_COURSE_ASSIGNED",
      module: "Training",
      entityType: "learning_assignment",
    });
  });

export const createTrainingSession = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    z
      .object({
        title: z.string().trim().min(2).max(160),
        courseId: z.string().uuid().nullable(),
        planId: z.string().uuid().nullable(),
        trainerUserId: z.string().uuid().nullable(),
        startsAt: z.string().datetime(),
        endsAt: z.string().datetime(),
        venue: z.string().trim().max(300),
        capacity: z.number().int().positive().nullable(),
        employeeIds: z.array(z.string().uuid()).min(1).max(100),
      })
      .refine((value) => value.courseId || value.planId, {
        message: "Link a course or development plan.",
      }),
  )
  .handler(async ({ context, data }) => {
    const admin = await assertOperationsAccess(context.userId, "operations.learning.manage");
    if (new Date(data.endsAt) <= new Date(data.startsAt))
      throw new Error("Session end must be after its start.");
    let linkedPlan: {
      employee_id: string;
      assessment_id: string;
      requirement_item_id: string;
    } | null = null;
    if (data.planId) {
      const { data: plan, error } = await admin
        .from("development_plans")
        .select("id, employee_id, status, assessment_id, requirement_item_id")
        .eq("id", data.planId)
        .maybeSingle();
      if (error) throw new Error(`Could not validate linked plan: ${error.message}`);
      if (!plan || !["APPROVED", "ACTIVE"].includes(plan.status))
        throw new Error("Training sessions must link to an approved or active development plan.");
      linkedPlan = plan;
      if (!data.employeeIds.includes(plan.employee_id))
        throw new Error("Include the plan's employee as a session participant.");
      if (data.employeeIds.some((employeeId) => employeeId !== plan.employee_id))
        throw new Error(
          "A development-plan session must be limited to the employee linked to that plan.",
        );
      await validateCurrentGap(
        admin,
        plan.employee_id,
        plan.assessment_id,
        plan.requirement_item_id,
      );
    }
    if (data.courseId) {
      const { data: course, error } = await admin
        .from("learning_courses")
        .select("id, status")
        .eq("id", data.courseId)
        .maybeSingle();
      if (error) throw new Error(`Could not validate training course: ${error.message}`);
      if (!course || course.status !== "PUBLISHED")
        throw new Error("Training sessions require a published course.");
    }
    if (data.capacity && data.employeeIds.length > data.capacity)
      throw new Error("Participant count exceeds the session capacity.");
    if (linkedPlan && data.courseId) {
      const { data: requirement, error: requirementError } = await admin
        .from("competency_requirement_items")
        .select("competency_definition_id")
        .eq("id", linkedPlan.requirement_item_id)
        .maybeSingle();
      if (requirementError)
        throw new Error(`Could not validate linked plan competency: ${requirementError.message}`);
      const { data: mapping, error: mappingError } = await admin
        .from("learning_course_competencies")
        .select("course_id")
        .eq("course_id", data.courseId)
        .eq("competency_definition_id", requirement?.competency_definition_id ?? "");
      if (mappingError)
        throw new Error(`Could not verify session course-to-gap mapping: ${mappingError.message}`);
      if (!mapping?.length)
        throw new Error("The session course must map to the competency linked to the plan.");
    }
    if (!data.planId) {
      if (!data.courseId) throw new Error("Link a session to a plan or course.");
      const { data: mappings, error: mappingError } = await admin
        .from("learning_course_competencies")
        .select("competency_definition_id")
        .eq("course_id", data.courseId);
      if (mappingError)
        throw new Error(`Could not validate course-to-gap mapping: ${mappingError.message}`);
      const competencyIds = (mappings ?? []).map((mapping) => mapping.competency_definition_id);
      const { data: requirements, error: requirementError } = await admin
        .from("competency_requirement_items")
        .select("requirement_set_id, competency_definition_id, required_level")
        .in("competency_definition_id", competencyIds);
      if (requirementError)
        throw new Error(`Could not load mapped position requirements: ${requirementError.message}`);
      const requirementIds = (requirements ?? []).map(
        (requirement) => requirement.requirement_set_id,
      );
      const { data: approvedSets, error: setError } = await admin
        .from("competency_requirement_sets")
        .select("id, job_position_id, version")
        .in("id", requirementIds)
        .eq("status", "APPROVED")
        .lte("effective_from", new Date().toISOString().slice(0, 10));
      if (setError)
        throw new Error(`Could not validate approved position requirements: ${setError.message}`);
      const currentSetByPosition = new Map<string, string>();
      for (const set of [...(approvedSets ?? [])].sort((a, b) => b.version - a.version)) {
        if (!currentSetByPosition.has(set.job_position_id))
          currentSetByPosition.set(set.job_position_id, set.id);
      }
      const { data: employees, error: employeeError } = await admin
        .from("employees")
        .select("id, job_position_id")
        .in("id", data.employeeIds)
        .eq("employment_status", "ACTIVE");
      if (employeeError)
        throw new Error(`Could not validate participants: ${employeeError.message}`);
      if (employees?.length !== data.employeeIds.length)
        throw new Error("Every participant must be active.");
      const { data: evidence, error: evidenceError } = await admin
        .from("competency_assessments")
        .select("employee_id, competency_definition_id, assessed_level, assessed_on, version")
        .eq("status", "APPROVED")
        .in("employee_id", data.employeeIds);
      if (evidenceError)
        throw new Error(`Could not validate current competency evidence: ${evidenceError.message}`);
      for (const employeeId of data.employeeIds) {
        const employeePositionId = employees?.find(
          (employee) => employee.id === employeeId,
        )?.job_position_id;
        const employeeSetId = employeePositionId
          ? currentSetByPosition.get(employeePositionId)
          : undefined;
        const applicable = (requirements ?? []).filter(
          (requirement) => requirement.requirement_set_id === employeeSetId,
        );
        const hasGap = applicable.some((requirement) => {
          const latest = (evidence ?? [])
            .filter(
              (assessment) =>
                assessment.employee_id === employeeId &&
                assessment.competency_definition_id === requirement.competency_definition_id,
            )
            .sort(
              (left, right) =>
                right.assessed_on.localeCompare(left.assessed_on) || right.version - left.version,
            )[0];
          return (
            competencyIds.includes(requirement.competency_definition_id) &&
            latest !== undefined &&
            latest.assessed_level < requirement.required_level
          );
        });
        if (!hasGap)
          throw new Error(
            "Course-only sessions require each participant to have an approved numeric gap for a competency mapped to the course. Use an approved development plan otherwise.",
          );
      }
    }
    const { data: session, error } = await admin
      .from("training_sessions")
      .insert({
        title: data.title,
        course_id: data.courseId,
        plan_id: data.planId,
        trainer_user_id: data.trainerUserId,
        starts_at: data.startsAt,
        ends_at: data.endsAt,
        venue: data.venue,
        capacity: data.capacity,
        created_by: context.userId,
      })
      .select("id")
      .single();
    if (error) throw new Error(`Could not schedule training session: ${error.message}`);
    const { error: attendeeError } = await admin.from("training_attendance").insert(
      data.employeeIds.map((employee_id) => ({
        session_id: session.id,
        employee_id,
        status: "REGISTERED",
      })),
    );
    if (attendeeError)
      throw new Error(
        `Session scheduled but participants could not be registered: ${attendeeError.message}`,
      );
    await writeAudit({
      actorUserId: context.userId,
      action: "TRAINING_SESSION_SCHEDULED",
      module: "Training",
      entityType: "training_session",
      entityId: session.id,
    });
    return { id: session.id };
  });

export const updateTrainingAttendance = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    z.object({
      id: z.string().uuid(),
      status: z.enum(["ATTENDED", "PARTIAL", "ABSENT", "EXCUSED"]),
      notes: z.string().trim().max(1000),
    }),
  )
  .handler(async ({ context, data }) => {
    const admin = await assertOperationsAccess(context.userId, "operations.learning.manage");
    const { error } = await admin
      .from("training_attendance")
      .update({
        status: data.status,
        attendance_notes: data.notes,
        recorded_by: context.userId,
        recorded_at: new Date().toISOString(),
      })
      .eq("id", data.id);
    if (error) throw new Error(`Could not record attendance: ${error.message}`);
    await writeAudit({
      actorUserId: context.userId,
      action: "TRAINING_ATTENDANCE_RECORDED",
      module: "Training",
      entityType: "training_attendance",
      entityId: data.id,
    });
  });

export const reviewAiRecommendation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    z.object({
      id: z.string().uuid(),
      decision: z.enum(["REJECTED", "EVIDENCE_REQUESTED"]),
      reason: z.string().trim().min(3).max(2000),
    }),
  )
  .handler(async ({ context, data }) => {
    const admin = await assertOperationsAccess(context.userId, "operations.recommendations.review");
    const { error } = await admin
      .from("operations_ai_recommendations")
      .update({
        status: data.decision,
        reviewer_user_id: context.userId,
        reviewer_decision: data.decision,
        decision_reason: data.reason,
        reviewed_at: new Date().toISOString(),
      })
      .eq("id", data.id)
      .eq("status", "PENDING_REVIEW");
    if (error) throw new Error(`Could not record recommendation review: ${error.message}`);
    await writeAudit({
      actorUserId: context.userId,
      action: `AI_RECOMMENDATION_${data.decision}`,
      module: "AI Recommendations",
      entityType: "operations_ai_recommendation",
      entityId: data.id,
      reason: data.reason,
    });
  });

export const acceptAiRecommendation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ id: z.string().uuid(), targetDate: z.string().date().nullable() }))
  .handler(async ({ context, data }) => {
    const admin = await assertOperationsAccess(context.userId, "operations.recommendations.review");
    const { data: recommendation, error } = await admin
      .from("operations_ai_recommendations")
      .select("*")
      .eq("id", data.id)
      .eq("status", "PENDING_REVIEW")
      .maybeSingle();
    if (error) throw new Error(`Could not load recommendation: ${error.message}`);
    if (!recommendation) throw new Error("This recommendation is no longer awaiting review.");
    await validateCurrentGap(
      admin,
      recommendation.employee_id,
      recommendation.assessment_id,
      recommendation.requirement_item_id,
    );
    const { data: plan, error: planError } = await admin
      .from("development_plans")
      .insert({
        employee_id: recommendation.employee_id,
        assessment_id: recommendation.assessment_id,
        requirement_item_id: recommendation.requirement_item_id,
        recommendation_id: recommendation.id,
        title: recommendation.activity_title,
        activity_type: recommendation.activity_type,
        activity_description: recommendation.rationale,
        success_criteria: recommendation.verification_method,
        target_date: data.targetDate,
        created_by: context.userId,
        status: "DRAFT",
      })
      .select("id")
      .single();
    if (planError)
      throw new Error(
        `Could not convert recommendation to a development plan: ${planError.message}`,
      );
    const { error: updateError } = await admin
      .from("operations_ai_recommendations")
      .update({
        status: "CONVERTED",
        reviewer_user_id: context.userId,
        reviewer_decision: "ACCEPTED",
        reviewed_at: new Date().toISOString(),
      })
      .eq("id", recommendation.id)
      .eq("status", "PENDING_REVIEW");
    if (updateError)
      throw new Error(`Plan created but recommendation conversion failed: ${updateError.message}`);
    await writeAudit({
      actorUserId: context.userId,
      action: "AI_RECOMMENDATION_ACCEPTED",
      module: "AI Recommendations",
      entityType: "operations_ai_recommendation",
      entityId: recommendation.id,
      newValue: { planId: plan.id },
    });
    return { planId: plan.id };
  });

export const linkVerifiedPlanReassessment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ planId: z.string().uuid(), assessmentId: z.string().uuid() }))
  .handler(async ({ context, data }) => {
    const admin = await assertOperationsAccess(context.userId, "operations.learning.manage");
    const { data: plan, error: planError } = await admin
      .from("development_plans")
      .select("id, employee_id, assessment_id, requirement_item_id, status")
      .eq("id", data.planId)
      .maybeSingle();
    if (planError) throw new Error(`Could not load plan for reassessment: ${planError.message}`);
    if (!plan || !["APPROVED", "ACTIVE"].includes(plan.status))
      throw new Error("Only approved or active plans can be closed after reassessment.");
    const { data: original, error: originalError } = await admin
      .from("competency_assessments")
      .select("id, employee_id, competency_definition_id, assessed_on")
      .eq("id", plan.assessment_id)
      .maybeSingle();
    if (originalError)
      throw new Error(`Could not validate original competency evidence: ${originalError.message}`);
    const { data: requirement, error: requirementError } = await admin
      .from("competency_requirement_items")
      .select("competency_definition_id, required_level")
      .eq("id", plan.requirement_item_id)
      .maybeSingle();
    if (requirementError)
      throw new Error(`Could not validate plan requirement: ${requirementError.message}`);
    const { data: reassessment, error: reassessmentError } = await admin
      .from("competency_assessments")
      .select(
        "id, employee_id, competency_definition_id, assessed_level, assessed_on, status, evidence_validated_by",
      )
      .eq("id", data.assessmentId)
      .maybeSingle();
    if (reassessmentError)
      throw new Error(`Could not validate follow-up assessment: ${reassessmentError.message}`);
    if (
      !original ||
      !requirement ||
      !reassessment ||
      reassessment.status !== "APPROVED" ||
      !reassessment.evidence_validated_by ||
      reassessment.employee_id !== plan.employee_id ||
      reassessment.employee_id !== original.employee_id ||
      reassessment.competency_definition_id !== requirement.competency_definition_id ||
      reassessment.competency_definition_id !== original.competency_definition_id ||
      reassessment.assessed_on <= original.assessed_on ||
      reassessment.assessed_level < requirement.required_level
    )
      throw new Error(
        "Plan closure requires a later approved reassessment with validated evidence that meets the linked requirement.",
      );
    const { error } = await admin
      .from("development_plans")
      .update({ followup_assessment_id: reassessment.id, status: "COMPLETED" })
      .eq("id", plan.id)
      .in("status", ["APPROVED", "ACTIVE"]);
    if (error) throw new Error(`Could not link verified reassessment: ${error.message}`);
    await writeAudit({
      actorUserId: context.userId,
      action: "DEVELOPMENT_PLAN_VERIFIED_BY_REASSESSMENT",
      module: "Training",
      entityType: "development_plan",
      entityId: plan.id,
      newValue: { assessmentId: reassessment.id },
    });
  });
