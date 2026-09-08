import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Json } from "@/integrations/supabase/types";

const activitySchema = z.enum([
  "Coaching",
  "Mentoring",
  "Self-Development",
  "External Learning",
  "External Training",
]);
const statusSchema = z.enum(["Recommended", "Ongoing", "Completed"]);
const recordFields = z.object({
  developmentNeed: z.string().trim().min(1).max(4000),
  developmentActivity: activitySchema,
  status: statusSchema,
  recordDate: z.string().date(),
  notes: z.string().max(4000),
});

export type DevelopmentRecord = {
  id: string;
  employeeId: string;
  employeeName: string;
  employeeNumber: string;
  sourceEvaluationId: string | null;
  sourceCycleName: string | null;
  sourceCycleYear: number | null;
  developmentNeed: string;
  developmentActivity: z.infer<typeof activitySchema>;
  status: z.infer<typeof statusSchema>;
  recordDate: string;
  notes: string;
  isSystemGenerated: boolean;
};

function mapRecord(row: Record<string, unknown>): DevelopmentRecord {
  const employee = row["employees"] as { full_name?: string; employee_number?: string } | null;
  const evaluation = row["evaluations"] as {
    id?: string;
    evaluation_cycles?: { name?: string; year?: number } | null;
  } | null;
  return {
    id: String(row["id"]),
    employeeId: String(row["employee_id"]),
    employeeName: employee?.full_name ?? "Unknown employee",
    employeeNumber: employee?.employee_number ?? "",
    sourceEvaluationId: (row["source_evaluation_id"] as string | null) ?? null,
    sourceCycleName: evaluation?.evaluation_cycles?.name ?? null,
    sourceCycleYear: evaluation?.evaluation_cycles?.year ?? null,
    developmentNeed: String(row["development_need"]),
    developmentActivity: row["development_activity"] as DevelopmentRecord["developmentActivity"],
    status: row["status"] as DevelopmentRecord["status"],
    recordDate: String(row["record_date"]),
    notes: String(row["notes"] ?? ""),
    isSystemGenerated: Boolean(row["is_system_generated"]),
  };
}

export const listDevelopmentRecords = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        search: z.string().max(200).default(""),
        employeeId: z.string().uuid().nullable().default(null),
        status: statusSchema.nullable().default(null),
        activity: activitySchema.nullable().default(null),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { getAdmin, requirePermission } = await import("./server-core.server");
    await requirePermission(context.userId, "learning.view", "Learning Management");
    const admin = await getAdmin();
    let query = admin
      .from("development_records")
      .select(
        "*, employees!inner(full_name, employee_number), evaluations(id, evaluation_cycles(name, year))",
      )
      .order("record_date", { ascending: false })
      .order("created_at", { ascending: false });
    if (data.employeeId) query = query.eq("employee_id", data.employeeId);
    if (data.status) query = query.eq("status", data.status);
    if (data.activity) query = query.eq("development_activity", data.activity);
    if (data.search.trim()) {
      const term = data.search.trim().replaceAll(",", " ");
      query = query.or(`development_need.ilike.%${term}%,notes.ilike.%${term}%`);
    }
    const { data: rows, error } = await query;
    if (error) throw new Error(error.message);
    return (rows ?? []).map((row) => mapRecord(row as unknown as Record<string, unknown>));
  });

export const listDevelopmentEmployees = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { getAdmin, requirePermission } = await import("./server-core.server");
    await requirePermission(context.userId, "learning.view", "Learning Management");
    const admin = await getAdmin();
    const { data, error } = await admin
      .from("employees")
      .select("id, full_name, employee_number")
      .order("full_name");
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const updateDevelopmentRecord = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => recordFields.extend({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { getAdmin, requirePermission, writeAudit, getActorRoles, validationError } =
      await import("./server-core.server");
    await requirePermission(context.userId, "learning.manage", "Learning Management");
    const admin = await getAdmin();
    const { data: previous } = await admin
      .from("development_records")
      .select("employee_id, development_need, development_activity, status, record_date, notes")
      .eq("id", data.id)
      .maybeSingle();
    if (!previous) throw validationError("Development record not found");
    const { error } = await admin
      .from("development_records")
      .update({
        development_need: data.developmentNeed,
        development_activity: data.developmentActivity,
        status: data.status,
        record_date: data.recordDate,
        notes: data.notes,
      })
      .eq("id", data.id);
    if (error) throw validationError(error.message);
    await writeAudit({
      actorUserId: context.userId,
      actorRole: (await getActorRoles(context.userId)).join(","),
      action: "DEVELOPMENT_RECORD_UPDATED",
      module: "Learning Management",
      entityType: "development_record",
      entityId: data.id,
      previousValue: previous,
      newValue: data,
    });
    return { ok: true as const };
  });

type Candidate = {
  key: string;
  need: string;
  activity: DevelopmentRecord["developmentActivity"];
  notes: string;
};

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function aiStrings(value: unknown): string[] {
  return Array.isArray(value)
    ? value
        .filter((item): item is string => typeof item === "string")
        .map(text)
        .filter(Boolean)
    : [];
}

function activityFor(
  value: string,
  fallback: DevelopmentRecord["developmentActivity"],
): DevelopmentRecord["developmentActivity"] {
  const lower = value.toLowerCase();
  if (lower.includes("mentor")) return "Mentoring";
  if (lower.includes("external") || lower.includes("course") || lower.includes("seminar"))
    return "External Learning";
  if (lower.includes("train")) return "External Training";
  if (lower.includes("coach")) return "Coaching";
  return fallback;
}

export async function ensureDevelopmentRecordsForEvaluation(evaluationId: string): Promise<void> {
  const { getAdmin } = await import("./server-core.server");
  const admin = await getAdmin();
  const { data: rawEvaluation } = await admin
    .from("evaluations")
    .select("*")
    .eq("id", evaluationId)
    .maybeSingle();
  const evaluation = rawEvaluation as unknown as {
    id: string;
    employee_id: string;
    is_finalized: boolean;
    finalized_at: string | null;
    supervisor_step2_development: string;
    supervisor_step2_strengths: string;
    supervisor_step2_weaknesses: string;
    supervisor_step2_effectiveness: string;
    supervisor_step2_growth_suggestions: string;
    supervisor_step2_recommendations: string;
    ai_analysis: Json;
  } | null;
  if (!evaluation?.is_finalized) return;

  const candidates: Candidate[] = [];
  const add = (
    key: string,
    need: string,
    activity: DevelopmentRecord["developmentActivity"],
    notes = "",
  ) => {
    const trimmed = need.trim();
    if (trimmed)
      candidates.push({ key, need: trimmed, activity: activityFor(trimmed, activity), notes });
  };
  add("step2-development", text(evaluation.supervisor_step2_development), "Self-Development");
  add("step2-growth-suggestions", text(evaluation.supervisor_step2_growth_suggestions), "Coaching");
  add(
    "step2-effectiveness",
    text(evaluation.supervisor_step2_effectiveness),
    "Coaching",
    `Supporting information: ${text(evaluation.supervisor_step2_strengths)}`,
  );
  add("step2-weaknesses", text(evaluation.supervisor_step2_weaknesses), "Self-Development");
  add("step2-recommendations", text(evaluation.supervisor_step2_recommendations), "Coaching");

  const analysis = (evaluation.ai_analysis ?? {}) as Json;
  if (analysis && typeof analysis === "object" && !Array.isArray(analysis)) {
    for (const [index, value] of aiStrings(analysis["developmentRecommendations"]).entries())
      add(`ai-development-${index}`, value, "Self-Development", "Advisory Gemini recommendation.");
    for (const [index, value] of aiStrings(analysis["coachingSuggestions"]).entries())
      add(`ai-coaching-${index}`, value, "Coaching", "Advisory Gemini recommendation.");
    for (const [index, value] of aiStrings(analysis["trainingRecommendations"]).entries())
      add(`ai-training-${index}`, value, "External Training", "Advisory Gemini recommendation.");
  }

  for (const candidate of candidates) {
    const { error } = await admin.from("development_records").upsert(
      {
        employee_id: evaluation.employee_id,
        source_evaluation_id: evaluation.id,
        source_key: candidate.key,
        development_need: candidate.need,
        development_activity: candidate.activity,
        status: "Recommended",
        record_date: (evaluation.finalized_at ?? new Date().toISOString()).slice(0, 10),
        notes: candidate.notes,
        is_system_generated: true,
      },
      { onConflict: "source_evaluation_id,source_key" },
    );
    if (error) throw new Error(error.message);
    await admin.from("notification_events").upsert(
      {
        event_type: "DEVELOPMENT_RECORD_CREATED",
        audience_permission: "learning.manage",
        title: "Development record created",
        body: "A development record is ready for HR tracking.",
        dedupe_key: `${evaluation.id}:DEVELOPMENT_RECORD:${candidate.key}`,
      } as never,
      { onConflict: "dedupe_key" },
    );
  }
}
