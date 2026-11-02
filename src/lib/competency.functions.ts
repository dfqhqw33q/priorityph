import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { normalizeRole, type AppRole } from "@/lib/domain";
import { getAdmin, requirePermission } from "@/lib/server-core.server";

const definitionSchema = z.object({
  code: z
    .string()
    .trim()
    .min(2)
    .max(40)
    .regex(/^[A-Za-z0-9][A-Za-z0-9_-]+$/),
  name: z.string().trim().min(2).max(120),
  category: z.string().trim().min(2).max(80),
  description: z.string().trim().min(10).max(2000),
  observableCriteria: z.array(z.string().trim().min(3).max(500)).min(1).max(20),
  assessmentMethods: z.array(z.string().trim().min(2).max(100)).min(1).max(10),
  evidenceRequirements: z.array(z.string().trim().min(3).max(500)).min(1).max(20),
  mandatoryQualification: z.boolean(),
  levels: z
    .array(
      z.object({
        level: z.number().int().min(1).max(5),
        label: z.string().trim().min(2).max(80),
        definition: z.string().trim().min(5).max(500),
      }),
    )
    .length(5),
});

const requirementsSchema = z.object({
  jobPositionId: z.string().uuid(),
  effectiveFrom: z.string().date(),
  requirements: z
    .array(
      z.object({
        competencyDefinitionId: z.string().uuid(),
        requiredLevel: z.number().int().min(1).max(5),
        mandatoryQualification: z.boolean(),
        qualificationLabel: z.string().trim().max(120).nullable(),
        assessmentMethod: z.string().trim().min(2).max(100),
        evidenceRequirement: z.string().trim().min(3).max(500),
      }),
    )
    .min(1)
    .max(100),
});

const assessmentSchema = z.object({
  employeeId: z.string().uuid(),
  competencyDefinitionId: z.string().uuid(),
  isReassessment: z.boolean(),
  assessedLevel: z.number().int().min(1).max(5),
  assessmentMethod: z.string().trim().min(2).max(100),
  evidenceNotes: z.string().trim().min(10).max(4000),
  assessedOn: z.string().date(),
  nextAssessmentOn: z.string().date().nullable(),
  sourceEvaluationId: z.string().uuid().nullable(),
  sourceAttachmentId: z.string().uuid().nullable(),
  evidenceReference: z.string().trim().max(500).nullable(),
});

const decisionSchema = z.object({
  id: z.string().uuid(),
  approve: z.boolean(),
  reason: z.string().trim().max(2000).nullable(),
});

async function actorRole(userId: string): Promise<AppRole> {
  const admin = await getAdmin();
  const { data, error } = await admin.from("user_roles").select("role").eq("user_id", userId);
  if (error) throw new Error(`Could not verify competency account role: ${error.message}`);
  const roles = (data ?? []).map((row) => normalizeRole(row.role));
  if (roles.length !== 1 || !roles[0])
    throw new Error("A single supported role is required for competency access.");
  return roles[0];
}

async function can(userId: string, permission: string) {
  const admin = await getAdmin();
  const { data, error } = await admin.rpc("has_permission", {
    _user_id: userId,
    _permission: permission,
  });
  if (error) throw new Error(`Could not verify ${permission}: ${error.message}`);
  return data === true;
}

export type CompetencyWorkspaceData = {
  role: AppRole;
  permissions: {
    manageFramework: boolean;
    manageRequirements: boolean;
    approveRequirements: boolean;
    assess: boolean;
    validateEvidence: boolean;
    approveAssessments: boolean;
    reassess: boolean;
  };
  employees: Array<{
    id: string;
    number: string;
    name: string;
    positionId: string | null;
    position: string;
    departmentId: string | null;
    department: string;
  }>;
  positions: Array<{ id: string; name: string }>;
  definitions: Array<{
    id: string;
    code: string;
    version: number;
    name: string;
    category: string;
    description: string;
    criteria: string[];
    methods: string[];
    evidenceRequirements: string[];
    mandatoryQualification: boolean;
    active: boolean;
    levels: Array<{ level: number; label: string; definition: string }>;
  }>;
  requirementSets: Array<{
    id: string;
    positionId: string;
    version: number;
    status: string;
    effectiveFrom: string;
    createdBy: string;
    approvedBy: string | null;
    approvedAt: string | null;
    decisionReason: string | null;
    items: Array<{
      id: string;
      competencyDefinitionId: string;
      requiredLevel: number;
      mandatoryQualification: boolean;
      qualificationLabel: string | null;
      assessmentMethod: string;
      evidenceRequirement: string;
    }>;
  }>;
  assessments: Array<{
    id: string;
    employeeId: string;
    competencyDefinitionId: string;
    requirementItemId: string;
    assessorId: string;
    assessorRole: string;
    employeeNameSnapshot: string;
    employeeNumberSnapshot: string;
    jobPositionSnapshot: string;
    departmentSnapshot: string;
    version: number;
    assessedLevel: number;
    assessmentMethod: string;
    evidenceNotes: string;
    assessedOn: string;
    nextAssessmentOn: string | null;
    status: string;
    evidenceValidatedBy: string | null;
    evidenceValidatedAt: string | null;
    approvalUserId: string | null;
    approvedAt: string | null;
    decisionReason: string | null;
    evidence: Array<{
      id: string;
      sourceEvaluationId: string | null;
      sourceAttachmentId: string | null;
      reference: string | null;
    }>;
  }>;
  finalizedEvaluations: Array<{ id: string; employeeId: string; period: string }>;
  history: Array<{
    id: string;
    assessmentId: string | null;
    requirementSetId: string | null;
    competencyDefinitionId: string | null;
    actorUserId: string | null;
    action: string;
    previousStatus: string | null;
    newStatus: string | null;
    reason: string | null;
    occurredAt: string;
  }>;
};

export const getCompetencyWorkspace = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<CompetencyWorkspaceData> => {
    const userId = context.userId;
    const role = await actorRole(userId);
    const [
      manageFramework,
      manageRequirements,
      approveRequirements,
      assess,
      validateEvidence,
      approveAssessments,
      reassess,
      canViewMatrix,
      canViewGaps,
    ] = await Promise.all([
      can(userId, "competencies.framework.manage"),
      can(userId, "competencies.requirements.manage"),
      can(userId, "competencies.requirements.approve"),
      can(userId, "competencies.assess"),
      can(userId, "competencies.evidence.validate"),
      can(userId, "competencies.assessments.approve"),
      can(userId, "competencies.reassess"),
      can(userId, "competencies.matrix.view"),
      can(userId, "competencies.gaps.view"),
    ]);
    if (
      !canViewMatrix &&
      !canViewGaps &&
      !(await can(userId, "competencies.assessments.view")) &&
      !(await can(userId, "competencies.framework.view"))
    ) {
      throw new Error("You do not have permission to view competency information.");
    }

    const admin = await getAdmin();
    let employeeQuery = admin
      .from("employees")
      .select(
        "id, employee_number, full_name, job_title, job_position_id, department_id, assigned_supervisor_user_id, user_id, employment_status",
      )
      .eq("employment_status", "ACTIVE");
    if (role === "EMPLOYEE") employeeQuery = employeeQuery.eq("user_id", userId);
    else if (role === "SUPERVISOR")
      employeeQuery = employeeQuery.eq("assigned_supervisor_user_id", userId);
    else if (role === "DEPARTMENT_HEAD") {
      const { data: assignments, error } = await admin
        .from("department_head_assignments")
        .select("department_id")
        .eq("user_id", userId)
        .eq("is_active", true);
      if (error)
        throw new Error(`Could not load authorized Department Head scope: ${error.message}`);
      const departmentIds = (assignments ?? []).map((assignment) => assignment.department_id);
      if (!departmentIds.length)
        return emptyWorkspace(role, {
          manageFramework,
          manageRequirements,
          approveRequirements,
          assess,
          validateEvidence,
          approveAssessments,
          reassess,
        });
      employeeQuery = employeeQuery.in("department_id", departmentIds);
    } else if (role === "HR") {
      if (!canViewMatrix) throw new Error("HR matrix access has not been granted to this account.");
    } else if (role === "OPERATIONS_MANAGER") {
      if (!canViewGaps) throw new Error("Competency gap access is not authorized.");
    } else {
      throw new Error("This legacy role has no competency workspace mapping.");
    }
    const { data: employeeRows, error: employeeError } = await employeeQuery.order("full_name");
    if (employeeError)
      throw new Error(`Could not load authorized employees: ${employeeError.message}`);
    const employees = employeeRows ?? [];
    const employeeIds = employees.map((employee) => employee.id);
    const positionIds = [
      ...new Set(
        employees
          .map((employee) => employee.job_position_id)
          .filter((id): id is string => Boolean(id)),
      ),
    ];

    const [
      { data: definitions, error: definitionsError },
      { data: positions, error: positionsError },
      { data: departments, error: departmentsError },
      { data: allRequirementSets, error: requirementSetsError },
      { data: allAssessments, error: assessmentsError },
    ] = await Promise.all([
      admin
        .from("competency_definitions")
        .select(
          "id, code, version, name, category, description, observable_criteria, assessment_methods, evidence_requirements, mandatory_qualification, active",
        )
        .order("name"),
      positionIds.length
        ? role === "HR"
          ? admin.from("job_positions").select("id, name").eq("is_active", true).order("name")
          : admin.from("job_positions").select("id, name").in("id", positionIds)
        : role === "HR"
          ? admin.from("job_positions").select("id, name").eq("is_active", true).order("name")
          : Promise.resolve({ data: [], error: null }),
      employees.some((employee) => employee.department_id !== null)
        ? admin
            .from("performance_departments")
            .select("id, label")
            .in("id", [
              ...new Set(
                employees
                  .map((employee) => employee.department_id)
                  .filter((id): id is string => Boolean(id)),
              ),
            ])
        : Promise.resolve({ data: [], error: null }),
      admin
        .from("competency_requirement_sets")
        .select(
          "id, job_position_id, version, status, effective_from, created_by, approved_by, approved_at, decision_reason",
        )
        .order("version", { ascending: false }),
      employeeIds.length
        ? admin
            .from("competency_assessments")
            .select(
              "id, employee_id, employee_number_snapshot, employee_name_snapshot, job_position_id, job_position_name_snapshot, department_id, department_label_snapshot, assigned_supervisor_user_id, department_head_user_id, competency_definition_id, requirement_item_id, assessor_user_id, assessor_role, version, assessed_level, assessment_method, evidence_notes, assessed_on, next_assessment_on, status, evidence_validated_by, evidence_validated_at, approval_user_id, approved_at, decision_reason",
            )
            .in("employee_id", employeeIds)
            .order("assessed_on", { ascending: false })
        : Promise.resolve({ data: [], error: null }),
    ]);
    if (definitionsError)
      throw new Error(`Could not load competency definitions: ${definitionsError.message}`);
    if (positionsError) throw new Error(`Could not load job positions: ${positionsError.message}`);
    if (departmentsError)
      throw new Error(`Could not load employee departments: ${departmentsError.message}`);
    if (requirementSetsError)
      throw new Error(
        `Could not load competency requirement history: ${requirementSetsError.message}`,
      );
    if (assessmentsError)
      throw new Error(`Could not load competency assessments: ${assessmentsError.message}`);

    const visibleSets =
      role === "HR" || role === "OPERATIONS_MANAGER"
        ? (allRequirementSets ?? [])
        : (allRequirementSets ?? []).filter((set) => positionIds.includes(set.job_position_id));
    const setIds = visibleSets.map((set) => set.id);
    const [
      { data: requirementItems, error: requirementItemsError },
      { data: levels, error: levelsError },
    ] = await Promise.all([
      setIds.length
        ? admin
            .from("competency_requirement_items")
            .select(
              "id, requirement_set_id, competency_definition_id, required_level, mandatory_qualification, qualification_label, assessment_method, evidence_requirement",
            )
            .in("requirement_set_id", setIds)
        : Promise.resolve({ data: [], error: null }),
      definitions?.length
        ? admin
            .from("competency_proficiency_levels")
            .select("competency_definition_id, level, label, observable_definition")
            .in(
              "competency_definition_id",
              definitions.map((definition) => definition.id),
            )
        : Promise.resolve({ data: [], error: null }),
    ]);
    if (requirementItemsError)
      throw new Error(`Could not load competency requirements: ${requirementItemsError.message}`);
    if (levelsError) throw new Error(`Could not load proficiency levels: ${levelsError.message}`);

    const assessments = allAssessments ?? [];
    const assessmentIds = assessments.map((assessment) => assessment.id);
    const requirementSetIds = visibleSets.map((set) => set.id);
    const [
      { data: evidenceRows, error: evidenceError },
      { data: assessmentEvents, error: assessmentEventsError },
      { data: requirementEvents, error: requirementEventsError },
      { data: definitionEvents, error: definitionEventsError },
      { data: finalizedRows, error: finalizedError },
    ] = await Promise.all([
      assessmentIds.length
        ? admin
            .from("competency_assessment_evidence")
            .select(
              "id, assessment_id, source_evaluation_id, source_attachment_id, evidence_reference",
            )
            .in("assessment_id", assessmentIds)
        : Promise.resolve({ data: [], error: null }),
      assessmentIds.length
        ? admin
            .from("competency_workflow_events")
            .select(
              "id, assessment_id, requirement_set_id, competency_definition_id, actor_user_id, action, previous_status, new_status, reason, occurred_at",
            )
            .in("assessment_id", assessmentIds)
        : Promise.resolve({ data: [], error: null }),
      requirementSetIds.length
        ? admin
            .from("competency_workflow_events")
            .select(
              "id, assessment_id, requirement_set_id, competency_definition_id, actor_user_id, action, previous_status, new_status, reason, occurred_at",
            )
            .in("requirement_set_id", requirementSetIds)
        : Promise.resolve({ data: [], error: null }),
      definitions?.length && manageFramework
        ? admin
            .from("competency_workflow_events")
            .select(
              "id, assessment_id, requirement_set_id, competency_definition_id, actor_user_id, action, previous_status, new_status, reason, occurred_at",
            )
            .in(
              "competency_definition_id",
              definitions.map((definition) => definition.id),
            )
        : Promise.resolve({ data: [], error: null }),
      employeeIds.length
        ? admin
            .from("employee_evaluations")
            .select("id, employee_id, evaluation_period_id")
            .eq("status", "FINALIZED")
            .in("employee_id", employeeIds)
        : Promise.resolve({ data: [], error: null }),
    ]);
    if (evidenceError)
      throw new Error(`Could not load supporting evidence: ${evidenceError.message}`);
    if (assessmentEventsError)
      throw new Error(`Could not load assessment audit history: ${assessmentEventsError.message}`);
    if (requirementEventsError)
      throw new Error(
        `Could not load requirement audit history: ${requirementEventsError.message}`,
      );
    if (definitionEventsError)
      throw new Error(
        `Could not load competency definition history: ${definitionEventsError.message}`,
      );
    if (finalizedError)
      throw new Error(`Could not load finalized evaluation references: ${finalizedError.message}`);
    const periodIds = [...new Set((finalizedRows ?? []).map((row) => row.evaluation_period_id))];
    const { data: periods, error: periodsError } = periodIds.length
      ? await admin.from("evaluation_periods").select("id, name").in("id", periodIds)
      : { data: [], error: null };
    if (periodsError)
      throw new Error(`Could not load finalized evaluation periods: ${periodsError.message}`);
    const periodNameById = new Map((periods ?? []).map((period) => [period.id, period.name]));
    const positionNameById = new Map(
      (positions ?? []).map((position) => [position.id, position.name]),
    );
    const departmentNameById = new Map(
      (departments ?? []).map((department) => [department.id, department.label]),
    );

    return {
      role,
      permissions: {
        manageFramework,
        manageRequirements,
        approveRequirements,
        assess,
        validateEvidence,
        approveAssessments,
        reassess,
      },
      employees: employees.map((employee) => ({
        id: employee.id,
        number: employee.employee_number,
        name: employee.full_name,
        positionId: employee.job_position_id,
        position: employee.job_position_id
          ? (positionNameById.get(employee.job_position_id) ?? employee.job_title)
          : employee.job_title || "Position not linked",
        departmentId: employee.department_id,
        department: employee.department_id
          ? (departmentNameById.get(employee.department_id) ?? "Department")
          : "Department not assigned",
      })),
      positions: (positions ?? []).map((position) => ({ id: position.id, name: position.name })),
      definitions: (definitions ?? []).map((definition) => ({
        id: definition.id,
        code: definition.code,
        version: definition.version,
        name: definition.name,
        category: definition.category,
        description: definition.description,
        criteria: definition.observable_criteria,
        methods: definition.assessment_methods,
        evidenceRequirements: definition.evidence_requirements,
        mandatoryQualification: definition.mandatory_qualification,
        active: definition.active,
        levels: (levels ?? [])
          .filter((level) => level.competency_definition_id === definition.id)
          .map((level) => ({
            level: level.level,
            label: level.label,
            definition: level.observable_definition,
          }))
          .sort((left, right) => left.level - right.level),
      })),
      requirementSets: visibleSets.map((set) => ({
        id: set.id,
        positionId: set.job_position_id,
        version: set.version,
        status: set.status,
        effectiveFrom: set.effective_from,
        createdBy: set.created_by,
        approvedBy: set.approved_by,
        approvedAt: set.approved_at,
        decisionReason: set.decision_reason,
        items: (requirementItems ?? [])
          .filter((item) => item.requirement_set_id === set.id)
          .map((item) => ({
            id: item.id,
            competencyDefinitionId: item.competency_definition_id,
            requiredLevel: item.required_level,
            mandatoryQualification: item.mandatory_qualification,
            qualificationLabel: item.qualification_label,
            assessmentMethod: item.assessment_method,
            evidenceRequirement: item.evidence_requirement,
          })),
      })),
      assessments: assessments.map((assessment) => ({
        id: assessment.id,
        employeeId: assessment.employee_id,
        competencyDefinitionId: assessment.competency_definition_id,
        requirementItemId: assessment.requirement_item_id,
        assessorId: assessment.assessor_user_id,
        assessorRole: assessment.assessor_role,
        employeeNameSnapshot: assessment.employee_name_snapshot,
        employeeNumberSnapshot: assessment.employee_number_snapshot,
        jobPositionSnapshot: assessment.job_position_name_snapshot,
        departmentSnapshot: assessment.department_label_snapshot,
        version: assessment.version,
        assessedLevel: assessment.assessed_level,
        assessmentMethod: assessment.assessment_method,
        evidenceNotes: assessment.evidence_notes,
        assessedOn: assessment.assessed_on,
        nextAssessmentOn: assessment.next_assessment_on,
        status: assessment.status,
        evidenceValidatedBy: assessment.evidence_validated_by,
        evidenceValidatedAt: assessment.evidence_validated_at,
        approvalUserId: assessment.approval_user_id,
        approvedAt: assessment.approved_at,
        decisionReason: assessment.decision_reason,
        evidence: (evidenceRows ?? [])
          .filter((evidence) => evidence.assessment_id === assessment.id)
          .map((evidence) => ({
            id: evidence.id,
            sourceEvaluationId: evidence.source_evaluation_id,
            sourceAttachmentId: evidence.source_attachment_id,
            reference: evidence.evidence_reference,
          })),
      })),
      finalizedEvaluations: (finalizedRows ?? []).map((evaluation) => ({
        id: evaluation.id,
        employeeId: evaluation.employee_id,
        period: periodNameById.get(evaluation.evaluation_period_id) ?? "Finalized evaluation",
      })),
      history: [
        ...(assessmentEvents ?? []),
        ...(requirementEvents ?? []),
        ...(definitionEvents ?? []),
      ]
        .sort((left, right) => right.occurred_at.localeCompare(left.occurred_at))
        .map((event) => ({
          id: event.id,
          assessmentId: event.assessment_id,
          requirementSetId: event.requirement_set_id,
          competencyDefinitionId: event.competency_definition_id,
          actorUserId: event.actor_user_id,
          action: event.action,
          previousStatus: event.previous_status,
          newStatus: event.new_status,
          reason: event.reason,
          occurredAt: event.occurred_at,
        })),
    };
  });

function emptyWorkspace(
  role: AppRole,
  permissions: CompetencyWorkspaceData["permissions"],
): CompetencyWorkspaceData {
  return {
    role,
    permissions,
    employees: [],
    positions: [],
    definitions: [],
    requirementSets: [],
    assessments: [],
    finalizedEvaluations: [],
    history: [],
  };
}

export const saveCompetencyDefinition = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => definitionSchema.parse(input))
  .handler(async ({ context, data }) => {
    await requirePermission(context.userId, "competencies.framework.manage");
    const admin = await getAdmin();
    const { data: id, error } = await admin.rpc("save_competency_definition", {
      _actor: context.userId,
      _code: data.code,
      _name: data.name,
      _category: data.category,
      _description: data.description,
      _observable_criteria: data.observableCriteria,
      _assessment_methods: data.assessmentMethods,
      _evidence_requirements: data.evidenceRequirements,
      _mandatory_qualification: data.mandatoryQualification,
      _levels: data.levels,
    });
    if (error) throw new Error(`Could not save competency definition: ${error.message}`);
    return { id };
  });

export const createCompetencyRequirements = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => requirementsSchema.parse(input))
  .handler(async ({ context, data }) => {
    await requirePermission(context.userId, "competencies.requirements.manage");
    const admin = await getAdmin();
    const { data: id, error } = await admin.rpc("create_competency_requirement_set", {
      _actor: context.userId,
      _job_position_id: data.jobPositionId,
      _effective_from: data.effectiveFrom,
      _items: data.requirements.map((requirement) => ({
        competency_definition_id: requirement.competencyDefinitionId,
        required_level: requirement.requiredLevel,
        mandatory_qualification: requirement.mandatoryQualification,
        qualification_label: requirement.qualificationLabel,
        assessment_method: requirement.assessmentMethod,
        evidence_requirement: requirement.evidenceRequirement,
      })),
    });
    if (error) throw new Error(`Could not submit position requirements: ${error.message}`);
    return { id };
  });

export const decideCompetencyRequirements = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => decisionSchema.parse(input))
  .handler(async ({ context, data }) => {
    await requirePermission(context.userId, "competencies.requirements.approve");
    const admin = await getAdmin();
    const { data: result, error } = await admin.rpc("decide_competency_requirement_set", {
      _actor: context.userId,
      _requirement_set_id: data.id,
      _approve: data.approve,
      _reason: data.reason,
    });
    if (error) throw new Error(`Could not decide competency requirements: ${error.message}`);
    return { status: result };
  });

export const submitCompetencyAssessment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => assessmentSchema.parse(input))
  .handler(async ({ context, data }) => {
    await requirePermission(
      context.userId,
      data.isReassessment ? "competencies.reassess" : "competencies.assess",
    );
    const admin = await getAdmin();
    const { data: id, error } = await admin.rpc("submit_competency_assessment", {
      _actor: context.userId,
      _employee_id: data.employeeId,
      _competency_definition_id: data.competencyDefinitionId,
      _assessed_level: data.assessedLevel,
      _assessment_method: data.assessmentMethod,
      _evidence_notes: data.evidenceNotes,
      _assessed_on: data.assessedOn,
      _next_assessment_on: data.nextAssessmentOn,
      _source_evaluation_id: data.sourceEvaluationId,
      _source_attachment_id: data.sourceAttachmentId,
      _evidence_reference: data.evidenceReference,
    });
    if (error) throw new Error(`Could not submit competency assessment: ${error.message}`);
    return { id };
  });

export const validateCompetencyEvidence = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) =>
    z
      .object({
        assessmentId: z.string().uuid(),
        valid: z.boolean(),
        reason: z.string().trim().max(2000).nullable(),
      })
      .parse(input),
  )
  .handler(async ({ context, data }) => {
    await requirePermission(context.userId, "competencies.evidence.validate");
    const admin = await getAdmin();
    const { error } = await admin.rpc("validate_competency_assessment_evidence", {
      _actor: context.userId,
      _assessment_id: data.assessmentId,
      _valid: data.valid,
      _reason: data.reason,
    });
    if (error) throw new Error(`Could not validate competency evidence: ${error.message}`);
    return { ok: true };
  });

export const decideCompetencyAssessment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => decisionSchema.parse(input))
  .handler(async ({ context, data }) => {
    await requirePermission(context.userId, "competencies.assessments.approve");
    const admin = await getAdmin();
    const { data: status, error } = await admin.rpc("decide_competency_assessment", {
      _actor: context.userId,
      _assessment_id: data.id,
      _approve: data.approve,
      _reason: data.reason,
    });
    if (error) throw new Error(`Could not decide competency assessment: ${error.message}`);
    return { status };
  });
