import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { reportFiltersSchema, type ReportFilters } from "./schemas";

const digital201FileInputSchema = z.object({
  employeeId: z.string().uuid(),
  selectedEvaluationId: z.string().uuid().nullable().optional(),
  comparisonEvaluationId: z.string().uuid().nullable().optional(),
  page: z.number().int().min(0).default(0),
  pageSize: z.number().int().min(1).max(50).default(10),
});

export type ReportRow = {
  evaluationId: string;
  employeeNumber: string;
  fullName: string;
  jobTitle: string;
  division: string;
  section: string;
  cycleName: string;
  cycleYear: number;
  status: string;
  submittedAt: string | null;
  employeeAverage: number | null;
  supervisorAverage: number | null;
  finalScore: number | null;
  finalRating: string | null;
  finalizedAt: string | null;
};

export const listDigital201Employees = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { getAdmin, requirePermission } = await import("./server-core.server");
    await requirePermission(context.userId, "evaluations.view_201", "Digital 201 File");
    const admin = await getAdmin();
    const { data } = await admin
      .from("employees")
      .select(
        "id, employee_number, full_name, job_title, division, section, employment_status, created_at",
      )
      .order("employee_number");
    return data ?? [];
  });

export const getCompetencyProfile = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => z.object({ employeeId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { getAdmin, requirePermission, validationError, writeAudit, getActorRoles } =
      await import("./server-core.server");
    await requirePermission(context.userId, "evaluations.view_201", "Competency Management");
    const admin = await getAdmin();
    const [{ data: employee }, { data: evaluations, error }] = await Promise.all([
      admin
        .from("employees")
        .select("id, employee_number, full_name, job_title, division, section")
        .eq("id", data.employeeId)
        .maybeSingle(),
      admin
        .from("evaluations")
        .select(
          "id, cycle_id, full_name_snapshot, employee_number_snapshot, job_title_snapshot, division_snapshot, section_snapshot, finalized_at, supervisor_step2_strengths, supervisor_step2_weaknesses, supervisor_step2_effectiveness, supervisor_step2_growth_suggestions, supervisor_step2_other_comments, evaluation_cycles!inner(name, year)",
        )
        .eq("employee_id", data.employeeId)
        .eq("status", "FINALIZED")
        .order("finalized_at", { ascending: false }),
    ]);
    if (error) throw validationError("Could not load finalized competency history");
    if (!employee) throw validationError("Employee record not found");
    const rows = evaluations ?? [];
    const ids = rows.map((row) => row.id);
    const { data: ratings } = ids.length
      ? await admin
          .from("evaluation_ratings")
          .select("evaluation_id, criterion_id, evaluator_type, rating")
          .in("evaluation_id", ids)
      : { data: [] };
    const criterionIds = Array.from(new Set((ratings ?? []).map((rating) => rating.criterion_id)));
    const { data: criteria } = criterionIds.length
      ? await admin
          .from("evaluation_criteria")
          .select("id, letter, title, description, position")
          .in("id", criterionIds)
          .order("position")
      : { data: [] };
    const criterionMap = new Map((criteria ?? []).map((criterion) => [criterion.id, criterion]));
    const byEvaluation = new Map<string, typeof ratings>();
    for (const rating of ratings ?? [])
      byEvaluation.set(rating.evaluation_id, [
        ...(byEvaluation.get(rating.evaluation_id) ?? []),
        rating,
      ]);
    const classify = (values: number[]) => {
      if (values.length === 0) return "Needs Further Development";
      const average = values.reduce((sum, value) => sum + value, 0) / values.length;
      const range = Math.max(...values) - Math.min(...values);
      if (average >= 4) return "Competency Strength";
      if (average <= 2) return "Development Need";
      if (range >= 2) return "Possible Development Area";
      return "Consistent Performance";
    };
    const history = rows.map((row) => {
      const cycle = row.evaluation_cycles as { name: string; year: number } | null;
      const factorRows = (criteria ?? []).map((criterion) => {
        const values = (byEvaluation.get(row.id) ?? []).filter(
          (rating) => rating.criterion_id === criterion.id,
        );
        const find = (type: string) =>
          values.find((rating) => rating.evaluator_type === type)?.rating ?? null;
        const numbers = values.map((rating) => rating.rating);
        return {
          letter: criterion.letter,
          title: criterion.title,
          description: criterion.description,
          employee: find("EMPLOYEE"),
          supervisor: find("SUPERVISOR"),
          reviewingSupervisor: find("REVIEWING_SUPERVISOR"),
          analysis: classify(numbers),
        };
      });
      return {
        id: row.id,
        cycleName: cycle?.name ?? "",
        cycleYear: cycle?.year ?? 0,
        finalizedAt: row.finalized_at,
        strengths: row.supervisor_step2_strengths ?? "",
        weaknesses: row.supervisor_step2_weaknesses ?? "",
        developmentRecommendations: row.supervisor_step2_growth_suggestions ?? "",
        development:
          row.supervisor_step2_effectiveness ?? row.supervisor_step2_growth_suggestions ?? "",
        sourceLabel: `${cycle?.year ?? ""} Annual Performance Evaluation`,
        factors: factorRows,
      };
    });
    const latest = history[0] ?? null;
    const previous = history[1] ?? null;
    const currentFactors = (latest?.factors ?? []).map((factor) => ({
      ...factor,
      trend: previous
        ? averageFactor(factor) >
          averageFactor(previous.factors.find((item) => item.letter === factor.letter))
          ? "Improving"
          : averageFactor(factor) <
              averageFactor(previous.factors.find((item) => item.letter === factor.letter))
            ? "Declining"
            : "Consistent"
        : "—",
    }));
    await writeAudit({
      actorUserId: context.userId,
      actorRole: (await getActorRoles(context.userId)).join(","),
      action: "COMPETENCY_PROFILE_VIEWED",
      module: "Competency Management",
      entityType: "employee",
      entityId: data.employeeId,
      newValue: { finalizedEvaluations: history.length },
    });
    return { employee, latest: latest ? { ...latest, factors: currentFactors } : null, history };
  });

function averageFactor(
  factor:
    | { employee: number | null; supervisor: number | null; reviewingSupervisor: number | null }
    | undefined,
) {
  if (!factor) return 0;
  const values = [factor.employee, factor.supervisor, factor.reviewingSupervisor].filter(
    (value): value is number => value !== null,
  );
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

function getRoleHistoryAccess(roleNames: string[]) {
  if (roleNames.includes("HR") || roleNames.includes("ADMINISTRATOR")) {
    return { permittedStatuses: null, supervisorOnly: false };
  }

  if (roleNames.includes("SUPERVISOR")) {
    return { permittedStatuses: null, supervisorOnly: true };
  }

  if (roleNames.includes("REVIEWING_SUPERVISOR") || roleNames.includes("COMMITTEE")) {
    return {
      permittedStatuses: ["FOR_REVIEW", "FOR_PROCESSING", "FOR_APPROVAL", "RETURNED", "FINALIZED"],
      supervisorOnly: false,
    };
  }

  if (roleNames.includes("PRESIDENT")) {
    return { permittedStatuses: ["FOR_APPROVAL", "RETURNED", "FINALIZED"], supervisorOnly: false };
  }

  return { permittedStatuses: [], supervisorOnly: false };
}

function getRoleCompletedAccess(roleNames: string[]) {
  if (roleNames.includes("ADMINISTRATOR")) {
    return {
      statusSet: ["FOR_REVIEW", "FOR_PROCESSING", "FOR_APPROVAL", "FINALIZED"],
      assignment: "all" as const,
    };
  }

  if (roleNames.includes("PRESIDENT")) {
    return { statusSet: ["FINALIZED"], assignment: "president" as const };
  }

  if (roleNames.includes("HR")) {
    return { statusSet: ["FOR_REVIEW"], assignment: "personnel" as const };
  }

  if (roleNames.includes("SUPERVISOR")) {
    return { statusSet: ["FOR_REVIEW"], assignment: "supervisor" as const };
  }

  if (roleNames.includes("REVIEWING_SUPERVISOR")) {
    return { statusSet: ["FOR_PROCESSING"], assignment: "reviewing_supervisor" as const };
  }

  if (roleNames.includes("COMMITTEE")) {
    return { statusSet: ["FOR_APPROVAL"], assignment: "committee" as const };
  }

  return { statusSet: [], assignment: "all" as const };
}

function getRoleDraftsAccess(roleNames: string[]) {
  if (roleNames.includes("HR") || roleNames.includes("ADMINISTRATOR")) {
    return { statusSet: ["DRAFT"], assignment: "all" as const };
  }

  if (roleNames.includes("SUPERVISOR")) {
    return { statusSet: ["DRAFT"], assignment: "supervisor" as const };
  }

  if (roleNames.includes("REVIEWING_SUPERVISOR")) {
    return { statusSet: ["DRAFT"], assignment: "reviewing_supervisor" as const };
  }

  if (roleNames.includes("COMMITTEE")) {
    return { statusSet: ["DRAFT"], assignment: "committee" as const };
  }

  if (roleNames.includes("PRESIDENT")) {
    return { statusSet: ["DRAFT"], assignment: "president" as const };
  }

  return { statusSet: [], assignment: "all" as const };
}

function getRoleReturnedAccess(roleNames: string[]) {
  if (roleNames.includes("HR") || roleNames.includes("ADMINISTRATOR")) {
    return { statusSet: ["RETURNED"], assignment: "all" as const };
  }

  if (roleNames.includes("SUPERVISOR")) {
    return { statusSet: ["RETURNED"], assignment: "supervisor" as const };
  }

  if (roleNames.includes("REVIEWING_SUPERVISOR")) {
    return { statusSet: ["RETURNED"], assignment: "reviewing_supervisor" as const };
  }

  if (roleNames.includes("COMMITTEE")) {
    return { statusSet: ["RETURNED"], assignment: "committee" as const };
  }

  if (roleNames.includes("PRESIDENT")) {
    return { statusSet: ["RETURNED"], assignment: "president" as const };
  }

  return { statusSet: [], assignment: "all" as const };
}

export const getReport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: Partial<ReportFilters>) => reportFiltersSchema.parse(input ?? {}))
  .handler(async ({ data, context }) => {
    const {
      requirePermissionAny,
      getAdmin,
      writeAudit,
      getActorRoles,
      queueFilterOptions,
      AuthorizationError,
    } = await import("./server-core.server");
    await requirePermissionAny(
      context.userId,
      [
        "cycles.view",
        "evaluations.view_201",
        "evaluations.view_step1",
        "evaluations.review_step3",
        "committee.review",
        "president.view",
      ],
      "Evaluation History",
    );
    const admin = await getAdmin();
    const roles = await getActorRoles(context.userId);
    const { permittedStatuses, supervisorOnly } = getRoleHistoryAccess(roles);
    const isCompletedView = data.recordType === "completed";
    const isDraftsView = data.recordType === "drafts";
    const isReturnedView = data.recordType === "returned";
    const { statusSet: completedStatusSet, assignment: completionAssignment } =
      getRoleCompletedAccess(roles);
    const { statusSet: draftStatusSet, assignment: draftAssignment } = getRoleDraftsAccess(roles);
    const { statusSet: returnedStatusSet, assignment: returnedAssignment } =
      getRoleReturnedAccess(roles);
    const effectivePermittedStatuses = isCompletedView
      ? completedStatusSet
      : isDraftsView
        ? draftStatusSet
        : isReturnedView
          ? returnedStatusSet
          : permittedStatuses;

    let query = admin
      .from("evaluations")
      .select(
        "id, status, employee_submitted_at, employee_number_snapshot, full_name_snapshot, job_title_snapshot, division_snapshot, section_snapshot, finalized_at, cycle_id, evaluation_cycles!inner(name, year)",
        { count: "exact" },
      )
      .order("employee_submitted_at", { ascending: false, nullsFirst: false });

    const search = data.search.trim();
    if (search) {
      const term = `%${search.replace(/[%,()]/g, "")}%`;
      query = query.or(`full_name_snapshot.ilike.${term},employee_number_snapshot.ilike.${term}`);
    }
    if (data.division.trim()) query = query.eq("division_snapshot", data.division.trim());
    if (data.section.trim()) query = query.eq("section_snapshot", data.section.trim());
    if (effectivePermittedStatuses && effectivePermittedStatuses.length > 0) {
      query = query.in("status", effectivePermittedStatuses as never);
    }
    if (
      !isCompletedView &&
      data.status.trim() &&
      (!permittedStatuses ||
        permittedStatuses.length === 0 ||
        permittedStatuses.includes(data.status.trim()))
    ) {
      query = query.eq("status", data.status.trim() as never);
    }
    if (supervisorOnly) query = query.eq("supervisor_user_id", context.userId);
    if (data.cycleId) query = query.eq("cycle_id", data.cycleId);
    if (data.year) query = query.eq("evaluation_cycles.year", data.year);
    if (data.finalRating.trim()) {
      const { data: matchingScores } = await admin
        .from("evaluation_scores")
        .select("evaluation_id")
        .eq("final_rating_label", data.finalRating.trim());
      const matchingIds = (matchingScores ?? []).map((score) => score.evaluation_id);
      if (matchingIds.length > 0) query = query.in("id", matchingIds);
      else query = query.eq("id", "00000000-0000-0000-0000-000000000000");
    }

    const workflowAssignment = isCompletedView
      ? completionAssignment
      : isDraftsView
        ? draftAssignment
        : isReturnedView
          ? returnedAssignment
          : "all";

    if (workflowAssignment !== "all") {
      let authorizedIds: string[] = [];
      const targetStatus = isCompletedView
        ? workflowAssignment === "supervisor" || workflowAssignment === "personnel"
          ? "FOR_REVIEW"
          : workflowAssignment === "reviewing_supervisor"
            ? "FOR_PROCESSING"
            : workflowAssignment === "committee"
              ? "FOR_APPROVAL"
              : workflowAssignment === "president"
                ? "FINALIZED"
                : "FOR_REVIEW"
        : isDraftsView
          ? "DRAFT"
          : "RETURNED";
      if (workflowAssignment === "supervisor") {
        const { data: rows } = await admin
          .from("evaluations")
          .select("id")
          .eq("status", targetStatus)
          .eq("supervisor_user_id", context.userId);
        authorizedIds = (rows ?? []).map((row) => row.id);
      } else if (workflowAssignment === "personnel") {
        const { data: rows } = await admin
          .from("personnel_processing")
          .select("evaluation_id")
          .eq("personnel_user_id", context.userId);
        const evaluationIds = (rows ?? []).map((row) => row.evaluation_id);
        if (evaluationIds.length > 0) {
          const { data: matchingRows } = await admin
            .from("evaluations")
            .select("id")
            .in("id", evaluationIds)
            .eq("status", targetStatus);
          authorizedIds = (matchingRows ?? []).map((row) => row.id);
        }
      } else if (workflowAssignment === "reviewing_supervisor") {
        const { data: rows } = await admin
          .from("reviewing_supervisor_reviews")
          .select("evaluation_id")
          .eq("reviewer_user_id", context.userId);
        const evaluationIds = (rows ?? []).map((row) => row.evaluation_id);
        if (evaluationIds.length > 0) {
          const { data: matchingRows } = await admin
            .from("evaluations")
            .select("id")
            .in("id", evaluationIds)
            .eq("status", targetStatus);
          authorizedIds = (matchingRows ?? []).map((row) => row.id);
        }
      } else if (workflowAssignment === "committee") {
        const { data: rows } = await admin
          .from("committee_reviews")
          .select("evaluation_id")
          .eq("committee_user_id", context.userId);
        const evaluationIds = (rows ?? []).map((row) => row.evaluation_id);
        if (evaluationIds.length > 0) {
          const { data: matchingRows } = await admin
            .from("evaluations")
            .select("id")
            .in("id", evaluationIds)
            .eq("status", targetStatus);
          authorizedIds = (matchingRows ?? []).map((row) => row.id);
        }
      } else if (workflowAssignment === "president") {
        const { data: rows } = await admin
          .from("evaluations")
          .select("id")
          .eq("status", targetStatus)
          .eq("president_user_id", context.userId);
        authorizedIds = (rows ?? []).map((row) => row.id);
      }

      if (authorizedIds.length === 0) {
        query = query.eq("id", "00000000-0000-0000-0000-000000000000");
      } else {
        query = query.in("id", authorizedIds as never);
      }
    }

    const from = data.page * data.pageSize;
    const { data: rows, count } = await query.range(from, from + data.pageSize - 1);
    const list = rows ?? [];

    const scoreMap = new Map<
      string,
      {
        employee: number | null;
        supervisor: number | null;
        final: number | null;
        label: string | null;
      }
    >();
    if (list.length > 0) {
      const { data: scores } = await admin
        .from("evaluation_scores")
        .select(
          "evaluation_id, employee_average, supervisor_average, final_score, final_rating_label",
        )
        .in(
          "evaluation_id",
          list.map((row) => row.id),
        );
      for (const score of scores ?? []) {
        scoreMap.set(score.evaluation_id, {
          employee: score.employee_average === null ? null : Number(score.employee_average),
          supervisor: score.supervisor_average === null ? null : Number(score.supervisor_average),
          final: score.final_score === null ? null : Number(score.final_score),
          label: score.final_rating_label,
        });
      }
    }

    const reportRows: ReportRow[] = list.map((row) => {
      const record = row as unknown as Record<string, unknown>;
      const cycle = record["evaluation_cycles"] as { name: string; year: number } | null;
      const score = scoreMap.get(row.id);
      return {
        evaluationId: row.id,
        employeeNumber: row.employee_number_snapshot,
        fullName: row.full_name_snapshot,
        jobTitle: row.job_title_snapshot,
        division: row.division_snapshot,
        section: row.section_snapshot,
        cycleName: cycle?.name ?? "",
        cycleYear: cycle?.year ?? 0,
        status: row.status,
        submittedAt: row.employee_submitted_at ?? null,
        employeeAverage: score?.employee ?? null,
        supervisorAverage: score?.supervisor ?? null,
        finalScore: score?.final ?? null,
        finalRating: score?.label ?? null,
        finalizedAt: row.finalized_at,
      };
    });

    const filtered = reportRows;

    // Cycle-wide aggregates, independent of pagination, are computed in the database.
    const { data: summaryRows, error: summaryError } = (await admin.rpc(
      "get_evaluation_score_summary" as never,
      {} as never,
    )) as unknown as {
      data: Array<{
        final_rating_label: string;
        score_count: number;
        score_total: number;
      }> | null;
      error: { message: string } | null;
    };
    if (summaryError) throw new Error(summaryError.message);
    const distribution = new Map<string, number>();
    let scored = 0;
    let total = 0;
    for (const row of summaryRows ?? []) {
      distribution.set(row.final_rating_label, Number(row.score_count));
      scored += Number(row.score_count);
      total += Number(row.score_total);
    }

    const [{ divisions, sections, years }, { data: cycles }] = await Promise.all([
      queueFilterOptions(),
      admin.from("evaluation_cycles").select("id, name, year").order("year", { ascending: false }),
    ]);

    await writeAudit({
      actorUserId: context.userId,
      actorRole: roles[0] ?? null,
      action: "REPORT_VIEWED",
      module: "Reports",
      newValue: { filters: data, resultCount: count ?? 0 },
    });

    return {
      rows: filtered,
      totalCount: count ?? 0,
      summary: {
        scored,
        averageFinalScore: scored > 0 ? total / scored : null,
        distribution: Array.from(distribution, ([label, value]) => ({ label, value })).sort(
          (a, b) => b.value - a.value,
        ),
      },
      options: { divisions, sections, years, cycles: cycles ?? [] },
    };
  });

/** Full permanent history for one evaluation: workflow events plus audit trail. */
export const getEvaluationHistory = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((input: { evaluationId: string }) => input)
  .handler(async ({ data, context }) => {
    const {
      requirePermissionAny,
      getAdmin,
      writeAudit,
      getActorRoles,
      loadEvaluationDetail,
      AuthorizationError,
    } = await import("./server-core.server");
    const { loadScore } = await import("./scoring.server");
    await requirePermissionAny(
      context.userId,
      [
        "cycles.view",
        "evaluations.view_201",
        "evaluations.view_step1",
        "evaluations.review_step3",
        "committee.review",
        "president.view",
      ],
      "Evaluation History",
    );
    const admin = await getAdmin();
    const roles = await getActorRoles(context.userId);

    const [detail, score, { data: events }, { data: logs }, { data: notifications }] =
      await Promise.all([
        loadEvaluationDetail(data.evaluationId),
        loadScore(data.evaluationId),
        admin
          .from("evaluation_events")
          .select("id, event_type, from_status, to_status, reason, occurred_at, actor_user_id")
          .eq("evaluation_id", data.evaluationId)
          .order("occurred_at", { ascending: false }),
        admin
          .from("audit_logs")
          .select("id, action, module, reason, occurred_at, actor_role, result")
          .eq("evaluation_id", data.evaluationId)
          .order("occurred_at", { ascending: false })
          .limit(200),
        admin
          .from("notification_events")
          .select("id, event_type, title, body, occurred_at")
          .eq("evaluation_id", data.evaluationId)
          .order("occurred_at", { ascending: false }),
      ]);

    if (!detail) return null;

    if (roles.includes("SUPERVISOR") && detail.supervisor_user_id !== context.userId) {
      throw new AuthorizationError();
    }

    if (roles.includes("REVIEWING_SUPERVISOR") || roles.includes("COMMITTEE")) {
      const allowed = ["FOR_REVIEW", "FOR_PROCESSING", "FOR_APPROVAL", "RETURNED", "FINALIZED"];
      if (!allowed.includes(detail.status)) throw new AuthorizationError();
    }

    if (roles.includes("PRESIDENT")) {
      const allowed = ["FOR_APPROVAL", "RETURNED", "FINALIZED"];
      if (!allowed.includes(detail.status)) throw new AuthorizationError();
    }

    const actorIds = Array.from(
      new Set((events ?? []).map((event) => event.actor_user_id).filter(Boolean) as string[]),
    );
    const names = new Map<string, string>();
    if (actorIds.length > 0) {
      const { data: users } = await admin
        .from("internal_users")
        .select("id, full_name")
        .in("id", actorIds);
      for (const user of users ?? []) names.set(user.id, user.full_name);
    }

    await writeAudit({
      actorUserId: context.userId,
      actorRole: roles[0] ?? null,
      action: "EVALUATION_HISTORY_VIEWED",
      module: "Evaluations",
      entityType: "evaluation",
      entityId: data.evaluationId,
      evaluationId: data.evaluationId,
    });

    return {
      detail,
      score,
      events: (events ?? []).map((event) => ({
        ...event,
        actorName: event.actor_user_id
          ? (names.get(event.actor_user_id) ?? "Unknown user")
          : "System",
      })),
      auditTrail: logs ?? [],
      notifications: notifications ?? [],
    };
  });

/** Paginated employee 201-file data and two evaluation periods for comparison. */
export const getDigital201File = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => digital201FileInputSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { getAdmin, requirePermission, writeAudit, getActorRoles, validationError } =
      await import("./server-core.server");
    await requirePermission(context.userId, "evaluations.view_201", "Digital 201 File");
    const admin = await getAdmin();

    const [{ data: employee }, { data: history, count, error: historyError }] = await Promise.all([
      admin
        .from("employees")
        .select(
          "id, employee_number, full_name, first_name, middle_name, last_name, job_title, division, section, employment_status, created_at, updated_at",
        )
        .eq("id", data.employeeId)
        .maybeSingle(),
      admin
        .from("evaluations")
        .select(
          "id, status, employee_submitted_at, supervisor_submitted_at, supervisor_step2_submitted_at, supervisor_step2_date, finalized_at, created_at, updated_at, employee_number_snapshot, full_name_snapshot, job_title_snapshot, division_snapshot, section_snapshot, supervisor_user_id, president_user_id, evaluation_cycles!inner(id, name, year)",
          { count: "exact" },
        )
        .eq("employee_id", data.employeeId)
        .order("created_at", { ascending: false })
        .range(data.page * data.pageSize, data.page * data.pageSize + data.pageSize - 1),
    ]);

    if (historyError) throw validationError("Could not load employee evaluation history");
    if (!employee) throw validationError("Employee record not found");

    const historyRows = history ?? [];
    const { data: evaluationOptions } = await admin
      .from("evaluations")
      .select("id, status, evaluation_cycles!inner(name, year)")
      .eq("employee_id", data.employeeId)
      .order("created_at", { ascending: false });
    const evaluationIds = Array.from(
      new Set(
        [
          data.selectedEvaluationId,
          data.comparisonEvaluationId,
          ...historyRows.map((row) => row.id),
        ].filter(Boolean),
      ),
    ) as string[];
    const [{ data: scores }, { data: ratings }] = await Promise.all([
      evaluationIds.length > 0
        ? admin
            .from("evaluation_scores")
            .select(
              "evaluation_id, employee_average, supervisor_average, final_score, final_rating_label, calculation_status",
            )
            .in("evaluation_id", evaluationIds)
        : Promise.resolve({ data: [] }),
      evaluationIds.length > 0
        ? admin
            .from("evaluation_ratings")
            .select("evaluation_id, criterion_id, evaluator_type, rating")
            .in("evaluation_id", evaluationIds)
            .order("criterion_id")
        : Promise.resolve({ data: [] }),
    ]);

    const criterionIds = Array.from(new Set((ratings ?? []).map((rating) => rating.criterion_id)));
    const { data: criteria } = criterionIds.length
      ? await admin
          .from("evaluation_criteria")
          .select("id, letter, title, position")
          .in("id", criterionIds)
          .order("position")
      : { data: [] };
    const criterionMap = new Map((criteria ?? []).map((criterion) => [criterion.id, criterion]));
    const scoreMap = new Map((scores ?? []).map((score) => [score.evaluation_id, score]));
    const [{ data: reviewRecords }, { data: stageUsers }] = await Promise.all([
      evaluationIds.length > 0
        ? admin
            .from("reviewing_supervisor_reviews")
            .select("evaluation_id, reviewer_user_id, submitted_at, reviewing_supervisor_date")
            .in("evaluation_id", evaluationIds)
        : Promise.resolve({ data: [] }),
      evaluationIds.length > 0
        ? admin.from("evaluations").select("supervisor_user_id").in("id", evaluationIds)
        : Promise.resolve({ data: [] }),
    ]);
    const reviewerIds = (reviewRecords ?? []).map((record) => record.reviewer_user_id);
    const supervisorIds = (stageUsers ?? [])
      .map((record) => record.supervisor_user_id)
      .filter(Boolean);
    const userIds = Array.from(
      new Set([...reviewerIds, ...supervisorIds].filter(Boolean)),
    ) as string[];
    const { data: evaluatorUsers } = userIds.length
      ? await admin.from("internal_users").select("id, full_name").in("id", userIds)
      : { data: [] };
    const evaluatorNames = new Map((evaluatorUsers ?? []).map((user) => [user.id, user.full_name]));
    const reviewMap = new Map(
      (reviewRecords ?? []).map((record) => [record.evaluation_id, record]),
    );
    const ratingsByEvaluation = new Map<string, typeof ratings>();
    for (const rating of ratings ?? []) {
      ratingsByEvaluation.set(rating.evaluation_id, [
        ...(ratingsByEvaluation.get(rating.evaluation_id) ?? []),
        rating,
      ]);
    }

    const selectedEvaluationId = data.selectedEvaluationId ?? null;
    const comparisonEvaluationId = data.comparisonEvaluationId ?? null;
    if (
      selectedEvaluationId &&
      comparisonEvaluationId &&
      selectedEvaluationId === comparisonEvaluationId
    ) {
      throw validationError("Select two different evaluation periods to compare");
    }
    const toEvaluation = (row: (typeof historyRows)[number]) => {
      const cycle = row.evaluation_cycles as { id: string; name: string; year: number } | null;
      const score = scoreMap.get(row.id);
      return {
        id: row.id,
        cycleId: cycle?.id ?? null,
        cycleName: cycle?.name ?? "",
        cycleYear: cycle?.year ?? 0,
        status: row.status,
        employeeSubmittedAt: row.employee_submitted_at,
        supervisorSubmittedAt: row.supervisor_submitted_at,
        finalizedAt: row.finalized_at,
        createdAt: row.created_at,
        employeeNumber: row.employee_number_snapshot,
        fullName: row.full_name_snapshot,
        jobTitle: row.job_title_snapshot,
        division: row.division_snapshot,
        section: row.section_snapshot,
        supervisorUserId: row.supervisor_user_id,
        supervisorName: row.supervisor_user_id
          ? (evaluatorNames.get(row.supervisor_user_id) ?? null)
          : null,
        reviewingSupervisorName: reviewMap.get(row.id)
          ? (evaluatorNames.get(reviewMap.get(row.id)!.reviewer_user_id) ?? null)
          : null,
        reviewingSupervisorDate: reviewMap.get(row.id)?.reviewing_supervisor_date ?? null,
        evaluationDate:
          row.supervisor_step2_date ??
          row.supervisor_step2_submitted_at ??
          row.finalized_at ??
          row.employee_submitted_at,
        presidentUserId: row.president_user_id,
        scores: score
          ? {
              employeeAverage: score.employee_average,
              supervisorAverage: score.supervisor_average,
              reviewingSupervisorAverage: null,
              finalScore: score.final_score,
              finalRatingLabel: score.final_rating_label,
              calculationStatus: score.calculation_status,
            }
          : null,
        ratings: (ratingsByEvaluation.get(row.id) ?? []).map((rating) => ({
          criterionId: rating.criterion_id,
          evaluatorType: rating.evaluator_type,
          rating: rating.rating,
          criterion: criterionMap.get(rating.criterion_id) ?? null,
        })),
      };
    };
    const rowMap = new Map(historyRows.map((row) => [row.id, row]));
    const comparisonIds = [selectedEvaluationId, comparisonEvaluationId].filter(
      Boolean,
    ) as string[];
    if (comparisonIds.some((id) => !rowMap.has(id))) {
      const { data: selectedRows } = await admin
        .from("evaluations")
        .select(
          "id, status, employee_submitted_at, supervisor_submitted_at, supervisor_step2_submitted_at, supervisor_step2_date, finalized_at, created_at, updated_at, employee_number_snapshot, full_name_snapshot, job_title_snapshot, division_snapshot, section_snapshot, supervisor_user_id, president_user_id, evaluation_cycles!inner(id, name, year)",
        )
        .eq("employee_id", data.employeeId)
        .in("id", comparisonIds);
      for (const row of selectedRows ?? []) rowMap.set(row.id, row);
    }

    const roles = await getActorRoles(context.userId);
    await writeAudit({
      actorUserId: context.userId,
      actorRole: roles.join(","),
      action: "DIGITAL_201_FILE_VIEWED",
      module: "Digital 201 File",
      entityType: "employee",
      entityId: data.employeeId,
      employeeId: data.employeeId,
      newValue: {
        selectedEvaluationId,
        comparisonEvaluationId,
        page: data.page,
        pageSize: data.pageSize,
      },
    });

    return {
      employee,
      evaluationOptions: (evaluationOptions ?? []).map((row) => {
        const cycle = row.evaluation_cycles as { name: string; year: number } | null;
        return {
          id: row.id,
          status: row.status,
          cycleName: cycle?.name ?? "",
          cycleYear: cycle?.year ?? 0,
        };
      }),
      history: historyRows.map(toEvaluation),
      selected: selectedEvaluationId
        ? rowMap.get(selectedEvaluationId)
          ? toEvaluation(rowMap.get(selectedEvaluationId)!)
          : null
        : null,
      comparison: comparisonEvaluationId
        ? rowMap.get(comparisonEvaluationId)
          ? toEvaluation(rowMap.get(comparisonEvaluationId)!)
          : null
        : null,
      totalCount: count ?? 0,
      page: data.page,
      pageSize: data.pageSize,
    };
  });
