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
  if (error instanceof Error) {
    const normalized = error.message.replace(/^VALIDATION:\s*/i, "").trim();
    if (normalized) return normalized;
  }

  if (typeof error === "string") {
    const normalized = error.replace(/^VALIDATION:\s*/i, "").trim();
    if (normalized) return normalized;
  }

  return fallback;
}
