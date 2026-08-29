import { z } from "zod";

export function normalizeDisplayText(value: string): string {
  return value.trim().replace(/\s+/g, " ").toUpperCase();
}

export function normalizeNameText(value: string): string {
  return normalizeDisplayText(value);
}

export function todayIsoDate(): string {
  return new Date().toISOString().slice(0, 10);
}

function extractIssuesFromUnknown(error: unknown): z.ZodIssue[] | null {
  if (error && typeof error === "object") {
    if ("issues" in error && Array.isArray((error as { issues?: unknown[] }).issues)) {
      const issues = (error as { issues?: unknown[] }).issues ?? [];
      const parsed = issues.filter((issue): issue is z.ZodIssue =>
        !!issue && typeof issue === "object" && "message" in issue,
      );
      if (parsed.length > 0) return parsed;
    }

    if (error instanceof Error && error.name === "ZodError" && "issues" in error) {
      const issues = (error as Error & { issues?: unknown[] }).issues ?? [];
      const parsed = issues.filter((issue): issue is z.ZodIssue =>
        !!issue && typeof issue === "object" && "message" in issue,
      );
      if (parsed.length > 0) return parsed;
    }
  }

  return null;
}

function parseRawIssueArray(raw: string): string[] {
  const trimmed = raw.trim();
  if (!trimmed.startsWith("[") || !trimmed.includes('"message"')) return [];

  try {
    const parsed = JSON.parse(trimmed) as unknown;
    if (!Array.isArray(parsed)) return [];
    const messages = parsed
      .map((entry) => {
        if (!entry || typeof entry !== "object") return null;
        const message = (entry as { message?: unknown }).message;
        return typeof message === "string" ? message.trim() : null;
      })
      .filter((message): message is string => !!message && message.length > 0);
    return messages;
  } catch {
    // Fall back to regex parsing for serialized Zod payloads.
    const matches = [...trimmed.matchAll(/"message"\s*:\s*"((?:\\.|[^"\\])*)"/g)]
      .map((match) => match[1].replace(/\\"/g, '"').replace(/\\n/g, " ").trim())
      .filter(Boolean);
    return matches;
  }
}

export function formatZodIssues(issues: readonly z.ZodIssue[]): string[] {
  const seen = new Set<string>();
  const messages: string[] = [];

  for (const issue of issues) {
    const detail = issue.message?.trim();
    if (!detail || seen.has(detail)) continue;
    seen.add(detail);
    messages.push(detail);
  }

  return messages;
}

export function formatValidationSummary(
  issues: readonly z.ZodIssue[] | undefined,
  fallback = "Please complete all required fields before submitting.",
): string {
  const messages = formatZodIssues(issues ?? []);
  if (messages.length === 0) return fallback;
  if (messages.length === 1) return messages[0];
  return `${fallback}\n\n• ${messages.map((message) => message.trim()).join("\n• ")}`;
}

export function userErrorMessage(error: unknown, fallback = "Please try again."): string {
  if (error && typeof error === "object") {
    const issues = extractIssuesFromUnknown(error);
    if (issues && issues.length > 0) {
      return formatValidationSummary(issues, fallback);
    }
  }

  if (error instanceof Error) {
    const raw = error.message.replace(/^VALIDATION:\s*/i, "").trim();
    if (!raw) return fallback;
    const issueMessages = parseRawIssueArray(raw);
    if (issueMessages.length > 0) return formatValidationSummary(issueMessages.map((message) => ({ message } as z.ZodIssue)), fallback);
    if (raw.startsWith("[") && raw.includes('"message"')) {
      return "Please complete all required fields before submitting.";
    }
    return raw;
  }

  if (typeof error === "string") {
    const normalized = error.replace(/^VALIDATION:\s*/i, "").trim();
    if (!normalized) return fallback;
    const issueMessages = parseRawIssueArray(normalized);
    if (issueMessages.length > 0) return formatValidationSummary(issueMessages.map((message) => ({ message } as z.ZodIssue)), fallback);
    if (normalized.startsWith("[") && normalized.includes('"message"')) {
      return "Please complete all required fields before submitting.";
    }
    return normalized;
  }

  return fallback;
}
