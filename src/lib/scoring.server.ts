// Server-only scoring engine and workflow helpers (Phase 8).
// All calculation happens here; client-supplied scores are never trusted.
import { getAdmin, validationError } from "./server-core.server";
import { roundTo, type CalculationStatus, type NotificationEventType, type ScoringRule } from "./domain";

export type LoadedRule = ScoringRule;

/** Loads a scoring rule with its factor weights and final-rating bands. */
export async function loadScoringRule(ruleId: string): Promise<LoadedRule | null> {
  const admin = await getAdmin();
  const { data: rule } = await admin.from("scoring_rules").select("*").eq("id", ruleId).maybeSingle();
  if (!rule) return null;
  const [{ data: weights }, { data: bands }] = await Promise.all([
    admin.from("scoring_rule_factor_weights").select("criterion_id, weight").eq("rule_id", ruleId),
    admin
      .from("scoring_rule_bands")
      .select("id, label, min_score, max_score, position")
      .eq("rule_id", ruleId)
      .order("position"),
  ]);
  return {
    id: rule.id,
    name: rule.name,
    version: rule.version,
    templateId: rule.template_id,
    status: rule.status,
    factorWeighting: rule.factor_weighting,
    requiredFactorWeightTotal: Number(rule.required_factor_weight_total),
    employeeWeight: Number(rule.employee_weight),
    supervisorWeight: Number(rule.supervisor_weight),
    roundingDecimals: rule.rounding_decimals,
    showEmployeeAverage: rule.show_employee_average,
    showSupervisorAverage: rule.show_supervisor_average,
    showPresidentResult: rule.show_president_result,
    notes: rule.notes,
    activatedAt: rule.activated_at,
    createdAt: rule.created_at,
    weights: (weights ?? []).map((row) => ({
      criterionId: row.criterion_id,
      weight: Number(row.weight),
    })),
    bands: (bands ?? []).map((row) => ({
      id: row.id,
      label: row.label,
      minScore: Number(row.min_score),
      maxScore: Number(row.max_score),
    })),
  };
}

export async function loadActiveScoringRule(templateId: string): Promise<LoadedRule | null> {
  const admin = await getAdmin();
  const { data } = await admin
    .from("scoring_rules")
    .select("id")
    .eq("template_id", templateId)
    .eq("status", "ACTIVE")
    .maybeSingle();
  return data ? loadScoringRule(data.id) : null;
}

/**
 * Validates a rule against the approved-configuration policy. Returns the list
 * of problems; an empty list means the rule may be activated.
 */
export function validateScoringRule(
  rule: Pick<
    LoadedRule,
    | "factorWeighting"
    | "requiredFactorWeightTotal"
    | "employeeWeight"
    | "supervisorWeight"
    | "weights"
    | "bands"
  >,
  criterionCount: number,
): string[] {
  const problems: string[] = [];

  if (rule.factorWeighting === "WEIGHTED") {
    if (rule.weights.length !== criterionCount)
      problems.push(`Provide a weight for all ${criterionCount} factors.`);
    if (rule.weights.some((weight) => !Number.isFinite(weight.weight) || weight.weight < 0))
      problems.push("Factor weights must be numeric and non-negative.");
    const total = rule.weights.reduce((sum, weight) => sum + weight.weight, 0);
    if (Math.abs(total - rule.requiredFactorWeightTotal) > 0.001)
      problems.push(
        `Factor weights must total ${rule.requiredFactorWeightTotal} (currently ${roundTo(total, 3)}).`,
      );
  }

  if (rule.bands.length === 0)
    problems.push("Define at least one final-rating band before activating the rule.");
  const sorted = [...rule.bands].sort((a, b) => a.minScore - b.minScore);
  for (let index = 0; index < sorted.length; index += 1) {
    const band = sorted[index]!;
    if (band.maxScore < band.minScore) problems.push(`Band "${band.label}" has an inverted range.`);
    const next = sorted[index + 1];
    if (next && next.minScore <= band.maxScore)
      problems.push(`Bands "${band.label}" and "${next.label}" overlap.`);
  }

  return problems;
}

type RatingRow = { criterion_id: string; evaluator_type: string; rating: number };

function averageFor(
  rule: LoadedRule,
  criteria: { id: string }[],
  ratings: RatingRow[],
  evaluator: string,
): number | null {
  const byCriterion = new Map<string, number>();
  for (const row of ratings) {
    if (row.evaluator_type === evaluator) byCriterion.set(row.criterion_id, row.rating);
  }
  if (byCriterion.size === 0) return null;
  if (byCriterion.size !== criteria.length) return null;

  if (rule.factorWeighting === "EQUAL") {
    let sum = 0;
    for (const criterion of criteria) sum += byCriterion.get(criterion.id) ?? 0;
    return sum / criteria.length;
  }

  const weights = new Map(rule.weights.map((weight) => [weight.criterionId, weight.weight]));
  let weighted = 0;
  let totalWeight = 0;
  for (const criterion of criteria) {
    const weight = weights.get(criterion.id) ?? 0;
    weighted += (byCriterion.get(criterion.id) ?? 0) * weight;
    totalWeight += weight;
  }
  if (totalWeight <= 0) return null;
  return weighted / totalWeight;
}

export type ScoreResult = {
  status: CalculationStatus;
  notes: string;
  employeeAverage: number | null;
  supervisorAverage: number | null;
  reviewingSupervisorAverage: number | null;
  presidentAverage: number | null;
  finalScore: number | null;
  finalRatingLabel: string | null;
  ruleId: string | null;
  ruleVersion: number | null;
  breakdown: Record<string, string | number | boolean | null>;
};

/**
 * Recomputes an evaluation's scores from stored ratings. Pure with respect to
 * the database (no writes), so it is safe to call repeatedly.
 */
export async function computeScore(evaluationId: string): Promise<ScoreResult> {
  const admin = await getAdmin();

  const { data: evaluation } = await admin
    .from("evaluations")
    .select("id, cycle_id, status, president_step2_submitted_at, president_step3_submitted_at")
    .eq("id", evaluationId)
    .maybeSingle();
  if (!evaluation) throw validationError("Evaluation not found");

  const { data: cycle } = await admin
    .from("evaluation_cycles")
    .select("template_id")
    .eq("id", evaluation.cycle_id)
    .maybeSingle();
  if (!cycle) throw validationError("Evaluation cycle not found");

  const rule = await loadActiveScoringRule(cycle.template_id);
  const { data: criteria } = await admin
    .from("evaluation_criteria")
    .select("id")
    .eq("template_id", cycle.template_id)
    .order("position");
  const criterionList = criteria ?? [];

  const invalid = (notes: string): ScoreResult => ({
    status: "INVALID",
    notes,
    employeeAverage: null,
    supervisorAverage: null,
    reviewingSupervisorAverage: null,
    presidentAverage: null,
    finalScore: null,
    finalRatingLabel: null,
    ruleId: rule?.id ?? null,
    ruleVersion: rule?.version ?? null,
    breakdown: {},
  });

  if (!rule)
    return invalid(
      "No active scoring rule is configured for this template. Configure and activate one before scoring.",
    );

  const problems = validateScoringRule(rule, criterionList.length);
  if (problems.length > 0) return invalid(problems.join(" "));

  const { data: ratings } = await admin
    .from("evaluation_ratings")
    .select("criterion_id, evaluator_type, rating")
    .eq("evaluation_id", evaluationId);
  const ratingRows = (ratings ?? []) as RatingRow[];

  if (ratingRows.some((row) => row.rating < 1 || row.rating > 5))
    return invalid("One or more ratings fall outside the approved 1–5 scale.");

  const employeeAverage = averageFor(rule, criterionList, ratingRows, "EMPLOYEE");
  const supervisorAverage = averageFor(rule, criterionList, ratingRows, "SUPERVISOR");
  const reviewingSupervisorAverage = averageFor(rule, criterionList, ratingRows, "REVIEWING_SUPERVISOR");

  if (employeeAverage === null || supervisorAverage === null || reviewingSupervisorAverage === null)
    return invalid("Employee, Supervisor, and Reviewing Supervisor ratings must be complete for all factors.");

  const finalScore = Math.min(
    5,
    Math.max(
      1,
      roundTo((employeeAverage + supervisorAverage + reviewingSupervisorAverage) / 3, rule.roundingDecimals),
    ),
  );
  const band = rule.bands.find((item) => finalScore >= item.minScore && finalScore <= item.maxScore);

  return {
    status: "CALCULATED",
    notes: band ? "" : "The final score does not fall inside any configured rating band.",
    employeeAverage: employeeAverage === null ? null : roundTo(employeeAverage, 4),
    supervisorAverage: supervisorAverage === null ? null : roundTo(supervisorAverage, 4),
    reviewingSupervisorAverage: roundTo(reviewingSupervisorAverage, 4),
    presidentAverage: null,
    finalScore,
    finalRatingLabel: band?.label ?? null,
    ruleId: rule.id,
    ruleVersion: rule.version,
    breakdown: {
      factorWeighting: rule.factorWeighting,
      scoringMethod: "THREE_EVALUATOR_AVERAGE",
      reviewingSupervisorAverage,
      roundingDecimals: rule.roundingDecimals,
      exactFinalScore: presidentAverage,
      criterionCount: criterionList.length,
    },
  };
}

/** Idempotent upsert of the calculated score. Locked scores are never overwritten. */
export async function persistScore(
  evaluationId: string,
  result: ScoreResult,
  userId: string,
): Promise<void> {
  const admin = await getAdmin();
  const { data: existing } = await admin
    .from("evaluation_scores")
    .select("id, is_locked")
    .eq("evaluation_id", evaluationId)
    .maybeSingle();

  if (existing?.is_locked) throw validationError("The calculated score is locked and cannot change");

  const payload = {
    evaluation_id: evaluationId,
    rule_id: result.ruleId,
    rule_version: result.ruleVersion,
    employee_average: result.employeeAverage,
    supervisor_average: result.supervisorAverage,
    president_average: result.presidentAverage,
    final_score: result.finalScore,
    final_rating_label: result.finalRatingLabel,
    calculation_status: result.status,
    calculation_notes: result.notes,
    breakdown: result.breakdown as never,
    calculated_at: new Date().toISOString(),
    calculated_by: userId,
  };

  const { error } = await admin
    .from("evaluation_scores")
    .upsert(payload, { onConflict: "evaluation_id" });
  if (error) throw validationError(error.message);
}

export async function loadScore(evaluationId: string) {
  const admin = await getAdmin();
  const { data } = await admin
    .from("evaluation_scores")
    .select("*")
    .eq("evaluation_id", evaluationId)
    .maybeSingle();
  if (!data) return null;
  return {
    evaluationId,
    ruleId: data.rule_id,
    ruleVersion: data.rule_version,
    employeeAverage: data.employee_average === null ? null : Number(data.employee_average),
    supervisorAverage: data.supervisor_average === null ? null : Number(data.supervisor_average),
    presidentAverage: data.president_average === null ? null : Number(data.president_average),
    finalScore: data.final_score === null ? null : Number(data.final_score),
    finalRatingLabel: data.final_rating_label,
    calculationStatus: data.calculation_status,
    calculationNotes: data.calculation_notes,
    isLocked: data.is_locked,
    calculatedAt: data.calculated_at,
  };
}

/**
 * Records an internal workflow notification. `dedupeKey` makes the write
 * idempotent so retried mutations never duplicate events. No external provider
 * is contacted — these are in-app activity events only.
 */
export async function emitNotification(input: {
  evaluationId?: string | null;
  cycleId?: string | null;
  eventType: NotificationEventType;
  audiencePermission: string;
  title: string;
  body?: string;
  payload?: Record<string, unknown>;
  dedupeKey: string;
}): Promise<void> {
  const admin = await getAdmin();
  const { error } = await admin.from("notification_events").upsert(
    {
      evaluation_id: input.evaluationId ?? null,
      cycle_id: input.cycleId ?? null,
      event_type: input.eventType,
      audience_permission: input.audiencePermission,
      title: input.title,
      body: input.body ?? "",
      payload: (input.payload ?? {}) as never,
      dedupe_key: input.dedupeKey,
    },
    { onConflict: "dedupe_key", ignoreDuplicates: true },
  );
  if (error) console.error("[notifications] failed to record event", error.message);
}

/** Server-side finalization eligibility check. */
export async function checkFinalizationEligibility(evaluationId: string): Promise<{
  eligible: boolean;
  blockers: string[];
  score: ScoreResult | null;
}> {
  const admin = await getAdmin();
  const { data: evaluation } = await admin
    .from("evaluations")
    .select(
      "id, status, is_finalized, employee_submitted_at, supervisor_submitted_at, president_step2_submitted_at, president_step3_submitted_at",
    )
    .eq("id", evaluationId)
    .maybeSingle();
  if (!evaluation) throw validationError("Evaluation not found");

  const blockers: string[] = [];
  if (evaluation.is_finalized) blockers.push("This evaluation is already finalized.");
  if (!evaluation.employee_submitted_at) blockers.push("The employee Step 1 submission is missing.");
  if (!evaluation.supervisor_submitted_at) blockers.push("The supervisor has not submitted ratings.");
  if (!evaluation.president_step2_submitted_at) blockers.push("President Step 2 is not complete.");
  if (!evaluation.president_step3_submitted_at) blockers.push("President Step 3 is not complete.");
  if (evaluation.status === "RETURNED_FOR_CORRECTION")
    blockers.push("An unresolved correction request is open.");

  let score: ScoreResult | null = null;
  if (blockers.length === 0) {
    score = await computeScore(evaluationId);
    if (score.status !== "CALCULATED") blockers.push(score.notes || "Scores could not be calculated.");
    if (score.status === "CALCULATED" && !score.finalRatingLabel)
      blockers.push("No final rating band matches the calculated score.");
  }

  return { eligible: blockers.length === 0, blockers, score };
}
