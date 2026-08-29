// Server-only helpers: privileged data access, authorization and audit logging.
// Never import this module from client code — always `await import()` it inside
// a server function handler.
import { getRequest } from "@tanstack/react-start/server";
import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/integrations/supabase/types";
import type { AppRole, EvaluationDetail, Permission } from "./domain";

export type AdminClient = SupabaseClient<Database>;

export async function getAdmin(): Promise<AdminClient> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as unknown as AdminClient;
}

export type RequestMeta = {
  ip: string | null;
  userAgent: string | null;
  correlationId: string;
};

export function getRequestMeta(): RequestMeta {
  let ip: string | null = null;
  let userAgent: string | null = null;
  try {
    const request = getRequest();
    const headers = request?.headers;
    if (headers) {
      ip =
        headers.get("cf-connecting-ip") ??
        headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
        null;
      userAgent = headers.get("user-agent");
    }
  } catch {
    // Request context is unavailable (e.g. during prerender) — audit without it.
  }
  return { ip, userAgent, correlationId: crypto.randomUUID() };
}

export type AuditEntry = {
  actorUserId?: string | null;
  actorRole?: string | null;
  action: string;
  module: string;
  entityType?: string | null;
  entityId?: string | null;
  employeeId?: string | null;
  evaluationId?: string | null;
  previousValue?: unknown;
  newValue?: unknown;
  reason?: string | null;
  result?: "SUCCESS" | "DENIED" | "FAILURE";
};

const REDACTED_KEYS = /password|token|secret|key|jwt/i;

function scrub(value: unknown): unknown {
  if (value === null || value === undefined) return null;
  if (Array.isArray(value)) return value.map(scrub);
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      out[key] = REDACTED_KEYS.test(key) ? "[redacted]" : scrub(item);
    }
    return out;
  }
  return value;
}

export async function writeAudit(entry: AuditEntry, meta?: RequestMeta): Promise<void> {
  const admin = await getAdmin();
  const requestMeta = meta ?? getRequestMeta();
  const { error } = await admin.from("audit_logs").insert({
    actor_user_id: entry.actorUserId ?? null,
    actor_role: entry.actorRole ?? null,
    action: entry.action,
    module: entry.module,
    entity_type: entry.entityType ?? null,
    entity_id: entry.entityId ?? null,
    employee_id: entry.employeeId ?? null,
    evaluation_id: entry.evaluationId ?? null,
    previous_value: scrub(entry.previousValue) as never,
    new_value: scrub(entry.newValue) as never,
    reason: entry.reason ?? null,
    correlation_id: requestMeta.correlationId,
    result: entry.result ?? "SUCCESS",
    ip_address: requestMeta.ip,
    user_agent: requestMeta.userAgent,
  });
  if (error) console.error("[audit] failed to write audit log", error.message);
}

export class AuthorizationError extends Error {
  constructor(message = "You are not authorized to perform this action") {
    super(message);
    this.name = "AuthorizationError";
  }
}

export async function getActorRoles(userId: string): Promise<AppRole[]> {
  const admin = await getAdmin();
  const { data } = await admin.from("user_roles").select("role").eq("user_id", userId);
  return (data ?? []).map((row) => row.role as AppRole);
}

/** Server-side authorization gate. Throws (and audits) when the caller lacks the permission. */
export async function requirePermission(
  userId: string,
  permission: Permission,
  moduleName: string,
): Promise<void> {
  const admin = await getAdmin();
  const { data, error } = await admin.rpc("has_permission", {
    _user_id: userId,
    _permission: permission,
  });
  if (error || data !== true) {
    const roles = await getActorRoles(userId);
    await writeAudit({
      actorUserId: userId,
      actorRole: roles.join(","),
      action: "UNAUTHORIZED_ACCESS_ATTEMPT",
      module: moduleName,
      newValue: { permission },
      result: "DENIED",
    });
    throw new AuthorizationError();
  }
}

export async function requireUsableAccount(userId: string): Promise<void> {
  const admin = await getAdmin();
  const { data } = await admin
    .from("internal_users")
    .select("is_active, is_locked")
    .eq("id", userId)
    .maybeSingle();
  if (!data || !data.is_active || data.is_locked) {
    throw new AuthorizationError("Your account is not active");
  }
}

export function safeMessage(error: unknown, fallback: string): string {
  if (error instanceof AuthorizationError) return error.message;
  if (error instanceof Error && error.message.startsWith("VALIDATION:")) {
    return error.message.replace("VALIDATION:", "").trim();
  }
  console.error(error);
  return fallback;
}

export function validationError(message: string): Error {
  return new Error(`VALIDATION: ${message}`);
}

export function generateCycleToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export function randomPassword(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%";
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(bytes)
    .map((b) => alphabet[b % alphabet.length])
    .join("");
}

/** Throws (and audits) unless the caller holds at least one of the permissions. */
export async function requirePermissionAny(
  userId: string,
  permissions: Permission[],
  moduleName: string,
): Promise<void> {
  const admin = await getAdmin();
  for (const permission of permissions) {
    const { data } = await admin.rpc("has_permission", {
      _user_id: userId,
      _permission: permission,
    });
    if (data === true) return;
  }
  const roles = await getActorRoles(userId);
  await writeAudit({
    actorUserId: userId,
    actorRole: roles.join(","),
    action: "UNAUTHORIZED_ACCESS_ATTEMPT",
    module: moduleName,
    newValue: { permissions },
    result: "DENIED",
  });
  throw new AuthorizationError();
}

export async function cycleCounts(cycleId: string) {
  const admin = await getAdmin();
  const count = async (statuses: string[]) => {
    const { count: value } = await admin
      .from("evaluations")
      .select("id", { count: "exact", head: true })
      .eq("cycle_id", cycleId)
      .in("status", statuses as never);
    return value ?? 0;
  };
  const [step1, supervisor, president] = await Promise.all([
    count([
      "EMPLOYEE_SUBMITTED",
      "SUPERVISOR_DRAFT",
      "SUPERVISOR_SUBMITTED",
      "PRESIDENT_REVIEW",
      "FINALIZED",
    ]),
    count(["SUPERVISOR_SUBMITTED", "PRESIDENT_REVIEW", "FINALIZED"]),
    count(["SUPERVISOR_SUBMITTED", "PRESIDENT_REVIEW"]),
  ]);
  return { step1_count: step1, supervisor_count: supervisor, president_count: president };
}

export type EvaluationQueueFilters = {
  search?: string;
  year?: number | null;
  division?: string;
  section?: string;
  status?: string | null;
  correctionStage?: string;
};

/**
 * Lists evaluations for the Supervisor/President queues. Deliberately unfiltered by
 * employee assignment: every authorised reviewer sees every eligible submission.
 */
export async function listEvaluations(statuses: string[], filters: EvaluationQueueFilters = {}) {
  const admin = await getAdmin();
  const effective =
    filters.status && statuses.includes(filters.status) ? [filters.status] : statuses;
  let query = admin
    .from("evaluations")
    .select(
      "id, status, correction_stage, supervisor_user_id, employee_number_snapshot, full_name_snapshot, job_title_snapshot, division_snapshot, section_snapshot, employee_submitted_at, supervisor_submitted_at, evaluation_cycles!inner(name, year)",
    )
    .in("status", effective as never)
    .order("employee_submitted_at", { ascending: false });

  const search = (filters.search ?? "").trim();
  if (search) {
    const term = `%${search.replace(/[%,()]/g, "")}%`;
    query = query.or(`full_name_snapshot.ilike.${term},employee_number_snapshot.ilike.${term}`);
  }
  if (filters.division?.trim()) query = query.eq("division_snapshot", filters.division.trim());
  if (filters.section?.trim()) query = query.eq("section_snapshot", filters.section.trim());
  if (filters.year) query = query.eq("evaluation_cycles.year", filters.year);
  if (filters.correctionStage) query = query.eq("correction_stage", filters.correctionStage);

  const { data } = await query;
  return (data ?? []).map((row) => {
    const record = row as unknown as Record<string, unknown>;
    const cycle = record["evaluation_cycles"] as { name: string; year: number } | null;
    const { evaluation_cycles: _ignored, ...rest } = record;
    return {
      ...rest,
      cycle_name: cycle?.name ?? "",
      cycle_year: cycle?.year ?? 0,
    };
  }) as never;
}

/** Distinct division/section/year values, used to populate queue filters. */
export async function queueFilterOptions() {
  const admin = await getAdmin();
  const [{ data: rows }, { data: cycles }] = await Promise.all([
    admin.from("evaluations").select("division_snapshot, section_snapshot").limit(2000),
    admin.from("evaluation_cycles").select("year"),
  ]);
  const divisions = Array.from(
    new Set((rows ?? []).map((r) => r.division_snapshot).filter((v) => v && v.trim())),
  ).sort();
  const sections = Array.from(
    new Set((rows ?? []).map((r) => r.section_snapshot).filter((v) => v && v.trim())),
  ).sort();
  const years = Array.from(new Set((cycles ?? []).map((c) => c.year))).sort((a, b) => b - a);
  return { divisions, sections, years };
}

export async function loadEvaluationDetail(evaluationId: string): Promise<EvaluationDetail | null> {
  const admin = await getAdmin();
  const { data: row } = await admin
    .from("evaluations")
    .select("*, evaluation_cycles(name, year, template_id, instructions)")
    .eq("id", evaluationId)
    .maybeSingle();
  if (!row) return null;
  const cycle = (
    row as never as {
      evaluation_cycles: { name: string; year: number; template_id: string; instructions: string };
    }
  ).evaluation_cycles;
  const supervisorId = (row as { supervisor_user_id: string | null }).supervisor_user_id;
  const [{ data: criteria }, { data: ratings }, { data: signature }, supervisor] = await Promise.all([
    admin
      .from("evaluation_criteria")
      .select("id, letter, title, description, position")
      .eq("template_id", cycle.template_id)
      .order("position"),
    admin
      .from("evaluation_ratings")
      .select("criterion_id, evaluator_type, rating, is_locked")
      .eq("evaluation_id", evaluationId),
    admin
      .from("evaluation_stage_signatures")
      .select("method, signature_data, storage_path, signed_at")
      .eq("evaluation_id", evaluationId)
      .eq("stage", "RATER_STEP2")
      .maybeSingle(),
    supervisorId
      ? admin.from("internal_users").select("full_name").eq("id", supervisorId).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);
  let raterSignature = signature ?? null;
  if (raterSignature?.storage_path) {
    const { data: signed } = await admin.storage
      .from("employee-files")
      .createSignedUrl(raterSignature.storage_path, 300);
    raterSignature = { ...raterSignature, signature_data: signed?.signedUrl ?? null };
  }
  return {
    ...(row as never as Record<string, unknown>),
    cycle_name: cycle.name,
    cycle_year: cycle.year,
    cycle_instructions: cycle.instructions ?? "",
    supervisor_name: supervisor?.data?.full_name ?? null,
    criteria: criteria ?? [],
    ratings: ratings ?? [],
    rater_signature: raterSignature,
  } as never;
}

export async function assertVersion(evaluationId: string, version: number) {
  const admin = await getAdmin();
  const { data } = await admin
    .from("evaluations")
    .select("id, status, version, is_finalized")
    .eq("id", evaluationId)
    .maybeSingle();
  if (!data) throw validationError("Evaluation not found");
  if (data.is_finalized) throw validationError("This evaluation is finalized");
  if (data.version !== version)
    throw validationError("This evaluation changed in another session. Reload and try again.");
  return data;
}

export async function upsertSupervisorRatings(
  evaluationId: string,
  ratings: { criterionId: string; rating: number }[],
  userId: string,
  lock: boolean,
) {
  const admin = await getAdmin();
  const { data: existing } = await admin
    .from("evaluation_ratings")
    .select("id, criterion_id, is_locked")
    .eq("evaluation_id", evaluationId)
    .eq("evaluator_type", "SUPERVISOR");
  const byCriterion = new Map((existing ?? []).map((r) => [r.criterion_id, r]));

  for (const entry of ratings) {
    const current = byCriterion.get(entry.criterionId);
    if (current) {
      if (current.is_locked) throw validationError("Locked ratings cannot be changed");
      const { error } = await admin
        .from("evaluation_ratings")
        .update({ rating: entry.rating, is_locked: lock, evaluator_user_id: userId })
        .eq("id", current.id);
      if (error) throw validationError(error.message);
    } else {
      const { error } = await admin.from("evaluation_ratings").insert({
        evaluation_id: evaluationId,
        criterion_id: entry.criterionId,
        evaluator_type: "SUPERVISOR",
        rating: entry.rating,
        is_locked: lock,
        evaluator_user_id: userId,
      });
      if (error) throw validationError(error.message);
    }
  }
}

export async function upsertPresidentRatings(
  evaluationId: string,
  ratings: { criterionId: string; rating: number }[],
  userId: string,
) {
  const admin = await getAdmin();
  const { data: existing } = await admin
    .from("evaluation_ratings")
    .select("id, criterion_id, is_locked")
    .eq("evaluation_id", evaluationId)
    .eq("evaluator_type", "PRESIDENT");
  const byCriterion = new Map((existing ?? []).map((row) => [row.criterion_id, row]));
  for (const entry of ratings) {
    const current = byCriterion.get(entry.criterionId);
    if (current?.is_locked) throw validationError("Locked President ratings cannot be changed");
    const result = current
      ? await admin
          .from("evaluation_ratings")
          .update({ rating: entry.rating, evaluator_user_id: userId })
          .eq("id", current.id)
      : await admin.from("evaluation_ratings").insert({
          evaluation_id: evaluationId,
          criterion_id: entry.criterionId,
          evaluator_type: "PRESIDENT",
          rating: entry.rating,
          evaluator_user_id: userId,
        });
    if (result.error) throw validationError(result.error.message);
  }
}

export async function dashboardStats(userId: string) {
  const admin = await getAdmin();
  const roles = await getActorRoles(userId);
  const evaluationCount = async (statuses: string[]) => {
    const { count } = await admin
      .from("evaluations")
      .select("id", { count: "exact", head: true })
      .in("status", statuses as never);
    return count ?? 0;
  };
  const [activeCycles, employees, awaitingSupervisor, awaitingPresident, finalized] =
    await Promise.all([
      admin
        .from("evaluation_cycles")
        .select("id", { count: "exact", head: true })
        .eq("status", "ACTIVE")
        .then((r) => r.count ?? 0),
      admin
        .from("employees")
        .select("id", { count: "exact", head: true })
        .then((r) => r.count ?? 0),
      evaluationCount(["EMPLOYEE_SUBMITTED", "SUPERVISOR_DRAFT"]),
      evaluationCount(["SUPERVISOR_SUBMITTED", "PRESIDENT_REVIEW"]),
      evaluationCount(["FINALIZED"]),
    ]);
  return { roles, activeCycles, employees, awaitingSupervisor, awaitingPresident, finalized };
}

// ---------------------------------------------------------------------------
// President Step 2 / Step 3
// ---------------------------------------------------------------------------

export type PresidentAnswerInput = { itemId: string; value: string };

type PresidentItemRow = {
  id: string;
  position: number;
  code: string;
  label: string;
  help_text: string;
  input_type: string;
  options: unknown;
  is_required: boolean;
};

function normaliseOptions(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is string => typeof entry === "string");
}

export async function loadPresidentStep(evaluationId: string, step: 2 | 3) {
  const admin = await getAdmin();
  const { data: template } = await admin
    .from("president_step_templates")
    .select("id, title, description")
    .eq("step", step)
    .eq("is_active", true)
    .order("created_at")
    .limit(1)
    .maybeSingle();
  if (!template) return null;

  const { data: items } = await admin
    .from("president_step_items")
    .select("id, position, code, label, help_text, input_type, options, is_required")
    .eq("template_id", template.id)
    .order("position");

  const { data: responses } = await admin
    .from("president_responses")
    .select("item_id, value_text, is_locked")
    .eq("evaluation_id", evaluationId)
    .eq("step", step);

  const answers: Record<string, string> = {};
  for (const response of responses ?? []) answers[response.item_id] = response.value_text;

  const { data: evaluation } = await admin
    .from("evaluations")
    .select("president_step2_submitted_at, president_step3_submitted_at")
    .eq("id", evaluationId)
    .maybeSingle();

  const submittedAt =
    step === 2
      ? (evaluation?.president_step2_submitted_at ?? null)
      : (evaluation?.president_step3_submitted_at ?? null);

  return {
    step,
    templateId: template.id,
    title: template.title,
    description: template.description,
    items: ((items ?? []) as PresidentItemRow[]).map((item) => ({
      id: item.id,
      position: item.position,
      code: item.code,
      label: item.label,
      help_text: item.help_text,
      input_type: item.input_type,
      options: normaliseOptions(item.options),
      is_required: item.is_required,
    })),
    answers,
    isLocked: (responses ?? []).some((r) => r.is_locked) || submittedAt !== null,
    submittedAt,
  };
}

/**
 * Idempotent save of the President's answers for one step. When `submit` is true,
 * every required item must be answered and the responses are locked afterwards.
 */
export async function savePresidentStep(
  evaluationId: string,
  step: 2 | 3,
  answers: PresidentAnswerInput[],
  userId: string,
  submit: boolean,
) {
  const admin = await getAdmin();
  const current = await loadPresidentStep(evaluationId, step);
  if (!current) throw validationError(`Step ${step} template is not configured`);
  if (current.isLocked) throw validationError(`Step ${step} has already been submitted`);

  const byId = new Map(current.items.map((item) => [item.id, item]));
  const merged = new Map(Object.entries(current.answers));
  for (const answer of answers) {
    const item = byId.get(answer.itemId);
    if (!item) throw validationError("Unknown question submitted");
    const value = answer.value.trim();
    if (item.input_type === "SINGLE_CHOICE" || item.input_type === "YES_NO") {
      const allowed = item.input_type === "YES_NO" ? ["Yes", "No"] : item.options;
      if (value && !allowed.includes(value)) throw validationError("Invalid option selected");
    }
    merged.set(answer.itemId, value);
  }

  if (submit) {
    for (const item of current.items) {
      if (item.is_required && !(merged.get(item.id) ?? "").trim())
        throw validationError(`"${item.label}" is required before submitting Step ${step}`);
    }
  }

  const { data: existing } = await admin
    .from("president_responses")
    .select("id, item_id, is_locked")
    .eq("evaluation_id", evaluationId)
    .eq("step", step);
  const existingByItem = new Map((existing ?? []).map((row) => [row.item_id, row]));

  for (const item of current.items) {
    const value = merged.get(item.id) ?? "";
    const row = existingByItem.get(item.id);
    if (row) {
      if (row.is_locked) throw validationError("Locked President responses cannot be changed");
      const { error } = await admin
        .from("president_responses")
        .update({ value_text: value, is_locked: submit, responded_by: userId })
        .eq("id", row.id);
      if (error) throw validationError(error.message);
    } else {
      const { error } = await admin.from("president_responses").insert({
        evaluation_id: evaluationId,
        item_id: item.id,
        step,
        value_text: value,
        is_locked: submit,
        responded_by: userId,
      });
      if (error) throw validationError(error.message);
    }
  }

  return { itemCount: current.items.length };
}

// ---------------------------------------------------------------------------
// Dashboard aggregates
// ---------------------------------------------------------------------------

async function countEvaluations(statuses: string[]) {
  const admin = await getAdmin();
  const { count } = await admin
    .from("evaluations")
    .select("id", { count: "exact", head: true })
    .in("status", statuses as never);
  return count ?? 0;
}

export async function supervisorStats() {
  const [totalStep1, pending, drafts, submitted, withPresident] = await Promise.all([
    countEvaluations([
      "EMPLOYEE_SUBMITTED",
      "SUPERVISOR_DRAFT",
      "SUPERVISOR_SUBMITTED",
      "PRESIDENT_REVIEW",
      "PRESIDENT_SUBMITTED",
      "FINALIZED",
    ]),
    countEvaluations(["EMPLOYEE_SUBMITTED"]),
    countEvaluations(["SUPERVISOR_DRAFT"]),
    countEvaluations(["SUPERVISOR_SUBMITTED"]),
    countEvaluations(["PRESIDENT_REVIEW", "PRESIDENT_SUBMITTED", "FINALIZED"]),
  ]);
  return { totalStep1, pending, drafts, submitted, withPresident };
}

export async function presidentStats() {
  const admin = await getAdmin();
  const [awaiting, inReview, submitted, finalized] = await Promise.all([
    countEvaluations(["SUPERVISOR_SUBMITTED"]),
    countEvaluations(["PRESIDENT_REVIEW"]),
    countEvaluations(["PRESIDENT_SUBMITTED"]),
    countEvaluations(["FINALIZED"]),
  ]);
  const [{ count: step2 }, { count: step3 }] = await Promise.all([
    admin
      .from("evaluations")
      .select("id", { count: "exact", head: true })
      .not("president_step2_submitted_at", "is", null),
    admin
      .from("evaluations")
      .select("id", { count: "exact", head: true })
      .not("president_step3_submitted_at", "is", null),
  ]);
  const { data: cycles } = await admin
    .from("evaluation_cycles")
    .select("year")
    .eq("status", "ACTIVE");
  return {
    awaiting,
    inReview,
    submitted,
    finalized,
    step2Completed: step2 ?? 0,
    step3Completed: step3 ?? 0,
    activeYears: Array.from(new Set((cycles ?? []).map((c) => c.year))).sort((a, b) => b - a),
  };
}

export async function adminStats() {
  const admin = await getAdmin();
  const [{ data: users }, { data: roleRows }, { data: permissionRows }] = await Promise.all([
    admin.from("internal_users").select("is_active, is_locked"),
    admin.from("user_roles").select("role"),
    admin.from("permissions").select("code"),
  ]);
  const [activeCycles, evaluations] = await Promise.all([
    admin
      .from("evaluation_cycles")
      .select("id", { count: "exact", head: true })
      .eq("status", "ACTIVE")
      .then((r) => r.count ?? 0),
    admin.from("evaluations").select("status"),
  ]);
  const byStatus: Record<string, number> = {};
  for (const row of evaluations.data ?? []) byStatus[row.status] = (byStatus[row.status] ?? 0) + 1;
  const roleCounts: Record<string, number> = {};
  for (const row of roleRows ?? []) roleCounts[row.role] = (roleCounts[row.role] ?? 0) + 1;

  return {
    totalUsers: (users ?? []).length,
    activeUsers: (users ?? []).filter((u) => u.is_active && !u.is_locked).length,
    inactiveUsers: (users ?? []).filter((u) => !u.is_active).length,
    lockedUsers: (users ?? []).filter((u) => u.is_locked).length,
    roleCounts,
    permissionCount: (permissionRows ?? []).length,
    activeCycles,
    totalEvaluations: (evaluations.data ?? []).length,
    evaluationsByStatus: byStatus,
  };
}

export async function recentActivity(modules: string[], limit = 8) {
  const admin = await getAdmin();
  const { data } = await admin
    .from("audit_logs")
    .select("id, occurred_at, action, module, result, reason")
    .in("module", modules)
    .order("occurred_at", { ascending: false })
    .limit(limit);
  return data ?? [];
}

export async function recentSecurityEvents(limit = 8) {
  const admin = await getAdmin();
  const { data } = await admin
    .from("login_events")
    .select("id, occurred_at, email, event_type, result")
    .order("occurred_at", { ascending: false })
    .limit(limit);
  return data ?? [];
}
