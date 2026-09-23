import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const activitySchema = z.enum([
  "Coaching",
  "Mentoring",
  "Self-Development",
  "External Learning",
  "External Training",
  "Not specified",
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
  employeeJobTitle: string;
  employeeDivision: string;
  employeeSection: string;
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
  const employee = row["employees"] as {
    full_name?: string;
    employee_number?: string;
    job_title?: string;
    division?: string;
    section?: string;
  } | null;
  const evaluation = row["evaluations"] as {
    id?: string;
    evaluation_cycles?: { name?: string; year?: number } | null;
  } | null;
  return {
    id: String(row["id"]),
    employeeId: String(row["employee_id"]),
    employeeName: employee?.full_name ?? "Unknown employee",
    employeeNumber: employee?.employee_number ?? "",
    employeeJobTitle: employee?.job_title ?? "",
    employeeDivision: employee?.division ?? "",
    employeeSection: employee?.section ?? "",
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
  .validator((input: unknown) =>
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
    const { getAdmin, requirePermission } = await import("../../lib/server-core.server");
    await requirePermission(context.userId, "learning.view", "Learning Management");
    const admin = await getAdmin();
    let query = admin
      .from("development_records")
      .select(
        "id, employee_id, source_evaluation_id, development_need, development_activity, status, record_date, notes, is_system_generated, created_at, employees!inner(full_name, employee_number, job_title, division, section), evaluations(id, evaluation_cycles(name, year))",
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
    const { getAdmin, requirePermission } = await import("../../lib/server-core.server");
    await requirePermission(context.userId, "learning.view", "Learning Management");
    const admin = await getAdmin();
    const { data, error } = await admin
      .from("employees")
      .select("id, full_name, employee_number")
      .is("user_id", null)
      .order("full_name");
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const updateDevelopmentRecord = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => recordFields.extend({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { getAdmin, requirePermission, writeAudit, getActorRoles, validationError } =
      await import("../../lib/server-core.server");
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

function activityFor(value: string): DevelopmentRecord["developmentActivity"] {
  const lower = value.toLowerCase();
  if (lower.includes("mentor")) return "Mentoring";
  if (lower.includes("self-development") || lower.includes("self development"))
    return "Self-Development";
  if (lower.includes("external learning")) return "External Learning";
  if (lower.includes("external training")) return "External Training";
  if (lower.includes("coach")) return "Coaching";
  return "Not specified";
}

function splitRecommendations(value: unknown): string[] {
  const textValue = text(value);
  if (!textValue) return [];
  const lines = textValue
    .split(/\r?\n/)
    .map((line) => line.replace(/^\s*(?:[-*•]|\d+[.)])\s*/, "").trim())
    .filter(Boolean);
  return lines.length > 0 ? lines : [textValue];
}

function isActionableDevelopment(value: string): boolean {
  return /\b(should|need(?:s)? to|would benefit|focus on|develop|improv|strengthen|practice|coach|mentor|train|learn|growth|recommend)\b/i.test(
    value,
  );
}

export async function ensureDevelopmentRecordsForEvaluation(evaluationId: string): Promise<void> {
  const { getAdmin } = await import("../../lib/server-core.server");
  const admin = await getAdmin();
  const { data: rawEvaluation } = await admin
    .from("evaluations")
    .select(
      "id, employee_id, is_finalized, finalized_at, supervisor_step2_strengths, supervisor_step2_effectiveness, supervisor_step2_growth_suggestions, supervisor_step2_other_comments",
    )
    .eq("id", evaluationId)
    .maybeSingle();
  const evaluation = rawEvaluation as unknown as {
    id: string;
    employee_id: string;
    is_finalized: boolean;
    finalized_at: string | null;
    supervisor_step2_strengths: string;
    supervisor_step2_effectiveness: string;
    supervisor_step2_growth_suggestions: string;
    supervisor_step2_other_comments: string;
  } | null;
  if (!evaluation?.is_finalized) return;

  const candidates: Candidate[] = [];
  const add = (key: string, need: string, notes = "") => {
    for (const [index, recommendation] of splitRecommendations(need).entries()) {
      if (!isActionableDevelopment(recommendation)) continue;
      candidates.push({
        key: `${key}-${index}`,
        need: recommendation,
        activity: activityFor(recommendation),
        notes,
      });
    }
  };
  add("step2-growth-suggestions", evaluation.supervisor_step2_growth_suggestions);
  add(
    "step2-effectiveness",
    evaluation.supervisor_step2_effectiveness,
    text(evaluation.supervisor_step2_strengths)
      ? `Supporting information: ${text(evaluation.supervisor_step2_strengths)}`
      : "",
  );
  add("step2-other-comments", evaluation.supervisor_step2_other_comments);

  const { data: existing } = await admin
    .from("development_records")
    .select("id, source_key, status")
    .eq("source_evaluation_id", evaluation.id)
    .eq("is_system_generated", true);
  const candidateKeys = new Set(candidates.map((candidate) => candidate.key));
  const staleIds = (existing ?? [])
    .filter((record) => record.status === "Recommended" && !candidateKeys.has(record.source_key))
    .map((record) => record.id);
  if (staleIds.length > 0) await admin.from("development_records").delete().in("id", staleIds);
  if (candidates.length === 0) return;
  const existingByKey = new Map((existing ?? []).map((record) => [record.source_key, record]));
  const candidatesToSync = candidates.filter((candidate) => {
    const current = existingByKey.get(candidate.key);
    return !current || current.status === "Recommended";
  });
  if (candidatesToSync.length === 0) return;
  const { error } = await admin.from("development_records").upsert(
    candidatesToSync.map((candidate) => ({
      employee_id: evaluation.employee_id,
      source_evaluation_id: evaluation.id,
      source_key: candidate.key,
      development_need: candidate.need,
      development_activity: candidate.activity,
      status: "Recommended" as const,
      record_date: (evaluation.finalized_at ?? new Date().toISOString()).slice(0, 10),
      notes: candidate.notes,
      is_system_generated: true,
    })),
    { onConflict: "source_evaluation_id,source_key" },
  );
  if (error) throw new Error(error.message);
  const { error: notificationError } = await admin.from("notification_events").upsert(
    candidatesToSync.map((candidate) => ({
      evaluation_id: evaluation.id,
      event_type: "DEVELOPMENT_RECORD_CREATED",
      audience_permission: "learning.manage",
      title: "Development Record Created",
      body: "A new employee development record has been created from a finalized performance evaluation.",
      dedupe_key: `${evaluation.id}:DEVELOPMENT_RECORD:${candidate.key}`,
    })) as never,
    { onConflict: "dedupe_key" },
  );
  if (notificationError) throw new Error(notificationError.message);
}
