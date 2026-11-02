import { getRequest } from "@tanstack/react-start/server";
import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/integrations/supabase/types";

export type AdminClient = SupabaseClient<Database>;

export async function getAdmin(): Promise<AdminClient> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as unknown as AdminClient;
}

export async function isEmailOtpEnabled(): Promise<boolean> {
  const admin = await getAdmin();
  const { data, error } = await admin
    .from("system_settings")
    .select("email_otp_enabled")
    .eq("id", "auth")
    .maybeSingle();
  if (error) {
    console.error("[security] Could not read email OTP setting; keeping OTP enabled", error);
    return true;
  }
  return data?.email_otp_enabled ?? true;
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
    // Audit records may be written outside an HTTP request context.
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

export async function requireStepUp(
  userId: string,
  sessionId: string,
  action: string,
  fresh = false,
) {
  const admin = await getAdmin();
  const { data, error } = await admin.rpc(
    "consume_step_up" as never,
    {
      _user_id: userId,
      _session_id: sessionId,
      _action_key: action,
      _fresh: fresh,
    } as never,
  );
  if (error) {
    console.error("[security] failed to consume step-up elevation", {
      userId,
      action,
      message: error.message,
    });
    throw new AuthorizationError("Step-up verification could not be validated. Please retry.");
  }
  if (data !== true) throw new AuthorizationError(`Step-up authentication required for ${action}`);
  return true;
}

export async function enforceRateLimit(
  bucketKey: string,
  windowSeconds: number,
  maxAttempts: number,
) {
  const admin = await getAdmin();
  const { data, error } = await admin.rpc(
    "check_rate_limit" as never,
    {
      _bucket_key: bucketKey.slice(0, 240),
      _window_seconds: windowSeconds,
      _max_attempts: maxAttempts,
    } as never,
  );
  if (error || data !== true)
    throw new AuthorizationError("Too many attempts. Please try again later.");
}

export async function getActorRoles(userId: string): Promise<string[]> {
  const admin = await getAdmin();
  const { data, error } = await admin.from("user_roles").select("role").eq("user_id", userId);
  if (error) throw new Error(`Could not load actor roles: ${error.message}`);
  return (data ?? []).map((row) => row.role);
}

export async function hasPermission(userId: string, permission: string): Promise<boolean> {
  const admin = await getAdmin();
  const { data, error } = await admin.rpc(
    "has_permission" as never,
    { _user_id: userId, _permission: permission } as never,
  );
  if (error) throw new AuthorizationError("Account permissions could not be verified");
  return data === true;
}

export async function requirePermission(userId: string, permission: string): Promise<void> {
  if (!(await hasPermission(userId, permission))) throw new AuthorizationError();
}

export function safeMessage(error: unknown, fallback: string): string {
  if (error instanceof AuthorizationError) return error.message;

  const parsedMessage = (value: string) => {
    try {
      const parsed = JSON.parse(value) as Array<{ message?: string }>;
      return parsed
        .map((issue) => issue.message)
        .filter((message): message is string => Boolean(message))
        .join("; ");
    } catch {
      return "";
    }
  };
  if (
    error &&
    typeof error === "object" &&
    "issues" in error &&
    Array.isArray((error as { issues?: unknown[] }).issues)
  ) {
    const message = (error as { issues?: { message?: string }[] }).issues
      ?.map((issue) => issue.message)
      .filter((value): value is string => Boolean(value))
      .join("; ");
    if (message) return message;
  }
  const raw = error instanceof Error ? error.message : typeof error === "string" ? error : "";
  const normalized = raw.replace(/^VALIDATION:\s*/i, "").trim();
  if (normalized) {
    if (normalized.startsWith("[") && normalized.includes('"message"'))
      return parsedMessage(normalized) || "Please complete all required fields before submitting.";
    return normalized;
  }
  console.error(error);
  return fallback;
}

export function validationError(message: string): Error {
  return new Error(`VALIDATION: ${message}`);
}

export function generateEmailOtp(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(4));
  const value = ((bytes[0]! << 24) | (bytes[1]! << 16) | (bytes[2]! << 8) | bytes[3]!) >>> 0;
  return String(value % 1_000_000).padStart(6, "0");
}

export async function hashEmailOtp(otp: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(otp));
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export async function sendEmailOtp(input: {
  email: string;
  fullName: string;
  otp: string;
}): Promise<{ sent: boolean; message: string }> {
  const apiKey = process.env["BREVO_API_KEY"];
  const fromAddress = process.env["EMAIL_FROM"] ?? "noreply@priorityhandling.local";
  if (!apiKey || !fromAddress.includes("@"))
    return { sent: false, message: "Email service is not configured." };
  const escapeHtml = (value: string) =>
    value.replace(/[&<>'"]/g, (character) => {
      const entities: Record<string, string> = {
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        "'": "&#39;",
        '"': "&quot;",
      };
      return entities[character] ?? character;
    });
  const response = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/json", "api-key": apiKey },
    body: JSON.stringify({
      sender: { name: "Priority Handling Logistics", email: fromAddress },
      to: [{ email: input.email, name: input.fullName }],
      subject: "Your Priority Handling verification code",
      htmlContent: `<p>Hello ${escapeHtml(input.fullName)},</p><p>Your verification code is:</p><p><strong>${escapeHtml(input.otp)}</strong></p><p>This code expires in five minutes and can be used only once.</p>`,
      textContent: `Your verification code is: ${input.otp}\n\nThis code expires in five minutes and can be used only once.`,
    }),
  });
  if (!response.ok) return { sent: false, message: `Email provider returned ${response.status}.` };
  return { sent: true, message: "Verification code sent." };
}
