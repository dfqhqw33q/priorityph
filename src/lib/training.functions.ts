import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Json } from "@/integrations/supabase/types";

const recommendationStatus = z.literal("Recommended");
const recordStatus = z.enum(["Required", "Approved", "Completed"]);
const recordFields = z.object({
  trainingTitle: z.string().trim().min(1).max(500),
  provider: z.string().max(300),
  trainingDate: z.string().date().nullable(),
  status: recordStatus,
  relatedCompetency: z.string().max(500),
  notes: z.string().max(4000),
});

export type TrainingRecommendation = {
  id: string;
  employeeId: string;
  employeeName: string;
  employeeNumber: string;
  sourceEvaluationId: string;
  sourceCycleName: string | null;
  sourceCycleYear: number | null;
  trainingTitle: string;
  relatedCompetency: string;
  source: "Gemini recommendation" | "Performance Evaluation" | "Competency Gap";
  recommendation: string;
  status: "Recommended";
};

export type TrainingRecord = {
  id: string;
  employeeId: string;
  employeeName: string;
  employeeNumber: string;
  sourceEvaluationId: string;
  sourceCycleName: string | null;
  sourceCycleYear: number | null;
  trainingTitle: string;
  provider: string;
  trainingDate: string | null;
  status: z.infer<typeof recordStatus>;
  relatedCompetency: string;
  notes: string;
};

function sourceInfo(row: Record<string, unknown>) {
  const employee = row["employees"] as { full_name?: string; employee_number?: string } | null;
  const evaluation = row["evaluations"] as {
    evaluation_cycles?: { name?: string; year?: number } | null;
  } | null;
  return {
    employeeId: String(row["employee_id"]),
    employeeName: employee?.full_name ?? "Unknown employee",
    employeeNumber: employee?.employee_number ?? "",
    sourceEvaluationId: String(row["source_evaluation_id"]),
    sourceCycleName: evaluation?.evaluation_cycles?.name ?? null,
    sourceCycleYear: evaluation?.evaluation_cycles?.year ?? null,
  };
}

function mapRecommendation(row: Record<string, unknown>): TrainingRecommendation {
  return {
    id: String(row["id"]),
    ...sourceInfo(row),
    trainingTitle: String(row["training_title"]),
    relatedCompetency: String(row["related_competency"] ?? ""),
    source: row["source"] as TrainingRecommendation["source"],
    recommendation: String(row["recommendation"]),
    status: "Recommended",
  };
}

function mapRecord(row: Record<string, unknown>): TrainingRecord {
  return {
    id: String(row["id"]),
    ...sourceInfo(row),
    trainingTitle: String(row["training_title"]),
    provider: String(row["provider"] ?? ""),
    trainingDate: (row["training_date"] as string | null) ?? null,
    status: row["status"] as TrainingRecord["status"],
    relatedCompetency: String(row["related_competency"] ?? ""),
    notes: String(row["notes"] ?? ""),
  };
}

const filterSchema = z.object({
  search: z.string().max(200).default(""),
  employeeId: z.string().uuid().nullable().default(null),
  status: z.string().max(30).nullable().default(null),
  provider: z.string().max(200).default(""),
  relatedCompetency: z.string().max(300).default(""),
});

export const listTrainingData = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => filterSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { getAdmin, requirePermission } = await import("./server-core.server");
    await requirePermission(context.userId, "training.view", "Training Management");
    const admin = await getAdmin();
    let recommendations = admin
      .from("training_recommendations")
      .select(
        "id, employee_id, source_evaluation_id, training_title, related_competency, source, recommendation, status, created_at, employees!inner(full_name, employee_number), evaluations(evaluation_cycles(name, year))",
      )
      .order("created_at", { ascending: false });
    let records = admin
      .from("training_records")
      .select(
        "id, employee_id, source_evaluation_id, training_title, provider, training_date, status, related_competency, notes, created_at, employees!inner(full_name, employee_number), evaluations(evaluation_cycles(name, year))",
      )
      .order("created_at", { ascending: false });
    if (data.employeeId) {
      recommendations = recommendations.eq("employee_id", data.employeeId);
      records = records.eq("employee_id", data.employeeId);
    }
    if (data.status) records = records.eq("status", data.status);
    if (data.provider.trim()) records = records.ilike("provider", `%${data.provider.trim()}%`);
    if (data.relatedCompetency.trim()) {
      recommendations = recommendations.ilike(
        "related_competency",
        `%${data.relatedCompetency.trim()}%`,
      );
      records = records.ilike("related_competency", `%${data.relatedCompetency.trim()}%`);
    }
    if (data.search.trim()) {
      const term = data.search.trim();
      recommendations = recommendations.or(
        `training_title.ilike.%${term}%,recommendation.ilike.%${term}%`,
      );
      records = records.or(
        `training_title.ilike.%${term}%,notes.ilike.%${term}%,provider.ilike.%${term}%`,
      );
    }
    const [
      { data: recommendationRows, error: recommendationError },
      { data: recordRows, error: recordError },
    ] = await Promise.all([recommendations, records]);
    if (recommendationError) throw new Error(recommendationError.message);
    if (recordError) throw new Error(recordError.message);
    return {
      recommendations: (recommendationRows ?? []).map((row) =>
        mapRecommendation(row as unknown as Record<string, unknown>),
      ),
      records: (recordRows ?? []).map((row) =>
        mapRecord(row as unknown as Record<string, unknown>),
      ),
    };
  });

export const listTrainingEmployees = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { getAdmin, requirePermission } = await import("./server-core.server");
    await requirePermission(context.userId, "training.view", "Training Management");
    const admin = await getAdmin();
    const { data, error } = await admin
      .from("employees")
      .select("id, full_name, employee_number")
      .order("full_name");
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const updateTrainingRecord = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => recordFields.extend({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { getAdmin, requirePermission, validationError, writeAudit, getActorRoles } =
      await import("./server-core.server");
    await requirePermission(context.userId, "training.manage", "Training Management");
    const admin = await getAdmin();
    const { data: previous } = await admin
      .from("training_records")
      .select("*")
      .eq("id", data.id)
      .maybeSingle();
    if (!previous) throw validationError("Training record not found");
    const { error } = await admin
      .from("training_records")
      .update({
        training_title: data.trainingTitle,
        provider: data.provider,
        training_date: data.trainingDate,
        status: data.status,
        related_competency: data.relatedCompetency,
        notes: data.notes,
      })
      .eq("id", data.id);
    if (error) throw validationError(error.message);
    await writeAudit({
      actorUserId: context.userId,
      actorRole: (await getActorRoles(context.userId)).join(","),
      action: "TRAINING_RECORD_UPDATED",
      module: "Training Management",
      entityType: "training_record",
      entityId: data.id,
      previousValue: previous,
      newValue: data,
    });
    return { ok: true as const };
  });

type RecommendationCandidate = {
  key: string;
  title: string;
  competency: string;
  source: TrainingRecommendation["source"];
  recommendation: string;
};

function clean(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}
function aiStrings(value: unknown): string[] {
  return Array.isArray(value)
    ? value
        .filter((item): item is string => typeof item === "string")
        .map(clean)
        .filter(Boolean)
    : [];
}

export async function ensureTrainingRecommendationsForEvaluation(
  evaluationId: string,
): Promise<void> {
  const { getAdmin } = await import("./server-core.server");
  const admin = await getAdmin();
  const { data: raw } = await admin
    .from("evaluations")
    .select(
      "id, employee_id, is_finalized, ai_analysis, supervisor_step2_development, supervisor_step2_effectiveness, supervisor_step2_growth_suggestions, supervisor_step2_recommendations",
    )
    .eq("id", evaluationId)
    .maybeSingle();
  const evaluation = raw as unknown as {
    id: string;
    employee_id: string;
    is_finalized: boolean;
    ai_analysis: Json;
    supervisor_step2_development: string;
    supervisor_step2_effectiveness: string;
    supervisor_step2_growth_suggestions: string;
    supervisor_step2_recommendations: string;
  } | null;
  if (!evaluation?.is_finalized) return;
  const candidates: RecommendationCandidate[] = [];
  const add = (
    key: string,
    title: string,
    recommendation: string,
    source: RecommendationCandidate["source"],
    competency = "",
  ) => {
    if (title.trim() && recommendation.trim())
      candidates.push({
        key,
        title: title.trim(),
        competency: competency.trim(),
        source,
        recommendation: recommendation.trim(),
      });
  };
  const analysis = (evaluation.ai_analysis ?? {}) as Json;
  if (analysis && typeof analysis === "object" && !Array.isArray(analysis)) {
    for (const [index, value] of aiStrings(analysis["trainingRecommendations"]).entries())
      add(`gemini-training-${index}`, value, value, "Gemini recommendation");
  }
  add(
    "evaluation-development",
    "Development-related external training",
    clean(evaluation.supervisor_step2_development),
    "Performance Evaluation",
  );
  add(
    "evaluation-effectiveness",
    "Job effectiveness development",
    clean(evaluation.supervisor_step2_effectiveness),
    "Performance Evaluation",
  );
  add(
    "evaluation-growth",
    "Growth and development training",
    clean(evaluation.supervisor_step2_growth_suggestions),
    "Performance Evaluation",
  );
  add(
    "evaluation-recommendations",
    "Recommended external training",
    clean(evaluation.supervisor_step2_recommendations),
    "Performance Evaluation",
  );

  const { data: ratings } = await admin
    .from("evaluation_ratings")
    .select("criterion_id, rating, evaluator_type, evaluation_criteria(title, letter)")
    .eq("evaluation_id", evaluationId)
    .eq("evaluator_type", "SUPERVISOR");
  for (const rating of ratings ?? []) {
    if (rating.rating <= 2) {
      const criterion = rating.evaluation_criteria as { title?: string; letter?: string } | null;
      const competency =
        `${criterion?.letter ?? ""} ${criterion?.title ?? "Competency gap"}`.trim();
      add(
        `competency-${rating.criterion_id}`,
        `External training for ${competency}`,
        `Consider third-party training to address the ${competency} competency gap.`,
        "Competency Gap",
        competency,
      );
    }
  }
  if (candidates.length === 0) return;
  const { error } = await admin.from("training_recommendations").upsert(
    candidates.map((candidate) => ({
      employee_id: evaluation.employee_id,
      source_evaluation_id: evaluation.id,
      source_key: candidate.key,
      training_title: candidate.title,
      related_competency: candidate.competency,
      source: candidate.source,
      recommendation: candidate.recommendation,
      status: "Recommended" as const,
    })),
    { onConflict: "source_evaluation_id,source_key" },
  );
  if (error) throw new Error(error.message);
  const { error: notificationError } = await admin.from("notification_events").upsert(
    candidates.map((candidate) => ({
      evaluation_id: evaluation.id,
      event_type: "TRAINING_RECOMMENDATION_CREATED",
      audience_permission: "training.manage",
      title: "Training Recommendation",
      body: "A training recommendation is available for review.",
      dedupe_key: `${evaluation.id}:TRAINING_RECOMMENDATION:${candidate.key}`,
    })) as never,
    { onConflict: "dedupe_key" },
  );
  if (notificationError) throw new Error(notificationError.message);
}

export async function ensureTrainingRequirementForCommitteeDecision(
  evaluationId: string,
  actionDetails: string,
): Promise<void> {
  const { getAdmin } = await import("./server-core.server");
  const admin = await getAdmin();
  const { data: evaluation } = await admin
    .from("evaluations")
    .select("id, employee_id, is_finalized")
    .eq("id", evaluationId)
    .maybeSingle();
  if (!evaluation) return;
  const title = clean(actionDetails) || "Training requirement from Committee review";
  const { error } = await admin.from("training_records").upsert(
    {
      employee_id: evaluation.employee_id,
      source_evaluation_id: evaluation.id,
      source_key: "committee-training-required",
      training_title: title,
      status: "Required",
      provider: "",
      training_date: null,
      related_competency: "",
      notes: "Officially required by the Performance Evaluation Committee.",
    },
    { onConflict: "source_evaluation_id,source_key" },
  );
  if (error) throw new Error(error.message);
  await admin.from("notification_events").upsert(
    {
      evaluation_id: evaluation.id,
      event_type: "TRAINING_REQUIREMENT_CREATED",
      audience_permission: "training.manage",
      title: "Training Required",
      body: "A training requirement has been identified for an employee and is ready for review.",
      dedupe_key: `${evaluation.id}:TRAINING_REQUIREMENT`,
    } as never,
    { onConflict: "dedupe_key" },
  );
}
