// Phase 9 — reporting, analytics and permanent evaluation history.
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

export const getReport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: Partial<ReportFilters>) => reportFiltersSchema.parse(input ?? {}))
  .handler(async ({ data, context }) => {
    const { requirePermission, getAdmin, writeAudit, getActorRoles, queueFilterOptions } =
      await import("./server-core.server");
    await requirePermission(context.userId, "evaluations.view_201", "Digital 201 File");
    const admin = await getAdmin();

    let query = admin
      .from("evaluations")
      .select(
        "id, status, employee_number_snapshot, full_name_snapshot, job_title_snapshot, division_snapshot, section_snapshot, finalized_at, cycle_id, evaluation_cycles!inner(name, year)",
        { count: "exact" },
      )
      .order("finalized_at", { ascending: false, nullsFirst: false });

    const search = data.search.trim();
    if (search) {
      const term = `%${search.replace(/[%,()]/g, "")}%`;
      query = query.or(`full_name_snapshot.ilike.${term},employee_number_snapshot.ilike.${term}`);
    }
    if (data.division.trim()) query = query.eq("division_snapshot", data.division.trim());
    if (data.section.trim()) query = query.eq("section_snapshot", data.section.trim());
    if (data.status.trim()) query = query.eq("status", data.status.trim() as never);
    if (data.cycleId) query = query.eq("cycle_id", data.cycleId);
    if (data.year) query = query.eq("evaluation_cycles.year", data.year);

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
        employeeAverage: score?.employee ?? null,
        supervisorAverage: score?.supervisor ?? null,
        finalScore: score?.final ?? null,
        finalRating: score?.label ?? null,
        finalizedAt: row.finalized_at,
      };
    });

    const filtered = data.finalRating.trim()
      ? reportRows.filter((row) => row.finalRating === data.finalRating.trim())
      : reportRows;

    // Cycle-wide aggregates, independent of pagination.
    const { data: allScores } = await admin
      .from("evaluation_scores")
      .select("final_score, final_rating_label, calculation_status");
    const calculated = (allScores ?? []).filter(
      (score) => score.calculation_status === "CALCULATED",
    );
    const distribution = new Map<string, number>();
    let total = 0;
    for (const score of calculated) {
      const label = score.final_rating_label ?? "Unrated";
      distribution.set(label, (distribution.get(label) ?? 0) + 1);
      total += Number(score.final_score ?? 0);
    }

    const [{ divisions, sections, years }, { data: cycles }] = await Promise.all([
      queueFilterOptions(),
      admin.from("evaluation_cycles").select("id, name, year").order("year", { ascending: false }),
    ]);

    const roles = await getActorRoles(context.userId);
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
        scored: calculated.length,
        averageFinalScore: calculated.length > 0 ? total / calculated.length : null,
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
  .inputValidator((input: { evaluationId: string }) => input)
  .handler(async ({ data, context }) => {
    const { requirePermission, getAdmin, writeAudit, getActorRoles, loadEvaluationDetail } =
      await import("./server-core.server");
    const { loadScore } = await import("./scoring.server");
    await requirePermission(context.userId, "evaluations.view_201", "Digital 201 File");
    const admin = await getAdmin();

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

    const roles = await getActorRoles(context.userId);
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
  .inputValidator((input: unknown) => digital201FileInputSchema.parse(input))
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
          "id, status, employee_submitted_at, supervisor_submitted_at, finalized_at, created_at, updated_at, employee_number_snapshot, full_name_snapshot, job_title_snapshot, division_snapshot, section_snapshot, supervisor_user_id, president_user_id, evaluation_cycles!inner(id, name, year)",
          { count: "exact" },
        )
        .eq("employee_id", data.employeeId)
        .order("created_at", { ascending: false })
        .range(data.page * data.pageSize, data.page * data.pageSize + data.pageSize - 1),
    ]);

    if (historyError) throw validationError("Could not load employee evaluation history");
    if (!employee) throw validationError("Employee record not found");

    const historyRows = history ?? [];
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
              "evaluation_id, employee_average, supervisor_average, reviewing_supervisor_average, final_score, final_rating_label, calculation_status",
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
    const ratingsByEvaluation = new Map<string, typeof ratings>();
    for (const rating of ratings ?? []) {
      ratingsByEvaluation.set(rating.evaluation_id, [
        ...(ratingsByEvaluation.get(rating.evaluation_id) ?? []),
        rating,
      ]);
    }

    const selectedEvaluationId = data.selectedEvaluationId ?? historyRows[0]?.id ?? null;
    const comparisonEvaluationId = data.comparisonEvaluationId ?? historyRows[1]?.id ?? null;
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
        presidentUserId: row.president_user_id,
        scores: score
          ? {
              employeeAverage: score.employee_average,
              supervisorAverage: score.supervisor_average,
              reviewingSupervisorAverage: score.reviewing_supervisor_average,
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
          "id, status, employee_submitted_at, supervisor_submitted_at, finalized_at, created_at, updated_at, employee_number_snapshot, full_name_snapshot, job_title_snapshot, division_snapshot, section_snapshot, supervisor_user_id, president_user_id, evaluation_cycles!inner(id, name, year)",
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
