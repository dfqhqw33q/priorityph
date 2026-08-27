// Phase 9 — reporting, analytics and permanent evaluation history.
import { createServerFn } from "@tanstack/react-start";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { reportFiltersSchema, type ReportFilters } from "./schemas";

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

export const getReport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: Partial<ReportFilters>) => reportFiltersSchema.parse(input ?? {}))
  .handler(async ({ data, context }) => {
    const { requirePermissionAny, getAdmin, writeAudit, getActorRoles, queueFilterOptions } =
      await import("./server-core.server");
    await requirePermissionAny(context.userId, ["reports.view", "evaluations.view_history"], "Reports");
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
      { employee: number | null; supervisor: number | null; final: number | null; label: string | null }
    >();
    if (list.length > 0) {
      const { data: scores } = await admin
        .from("evaluation_scores")
        .select("evaluation_id, employee_average, supervisor_average, final_score, final_rating_label")
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
      const cycle = record['evaluation_cycles'] as { name: string; year: number } | null;
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
    const calculated = (allScores ?? []).filter((score) => score.calculation_status === "CALCULATED");
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
    await requirePermission(context.userId, "evaluations.view_history", "Evaluations");
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
        actorName: event.actor_user_id ? (names.get(event.actor_user_id) ?? "Unknown user") : "System",
      })),
      auditTrail: logs ?? [],
      notifications: notifications ?? [],
    };
  });
