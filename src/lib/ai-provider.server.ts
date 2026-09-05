/**
 * Server-side AI text generation for evaluation assistance.
 *
 * Uses OpenRouter when OPENROUTER_API_KEY is configured. A deterministic mock
 * is available only when explicitly enabled outside production for local testing.
 */

export class AiUnavailableError extends Error {}

export type AiProviderName = "openrouter" | "development-mock" | "unavailable";

export function getAiProviderName(): AiProviderName {
  if (process.env["OPENROUTER_API_KEY"]) return "openrouter";
  if (process.env["AI_PROVIDER"] === "mock" && process.env["NODE_ENV"] !== "production")
    return "development-mock";
  return "unavailable";
}

function timeoutSignal(milliseconds: number): AbortSignal {
  return AbortSignal.timeout ? AbortSignal.timeout(milliseconds) : new AbortController().signal;
}

async function callOpenRouter(apiKey: string, prompt: string, json: boolean): Promise<string> {
  const model = process.env["OPENROUTER_MODEL"] || "minimax/minimax-m3:free";
  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    signal: timeoutSignal(15_000),
    body: JSON.stringify({
      model,
      messages: [{ role: "user", content: prompt }],
      ...(json ? { response_format: { type: "json_object" } } : {}),
    }),
  });
  if (response.status === 429)
    throw new AiUnavailableError("AI is rate limited. Try again shortly.");
  if (!response.ok) throw new AiUnavailableError("OpenRouter AI request failed.");
  const payload = (await response.json()) as {
    choices?: Array<{
      message?: { content?: string | Array<{ type?: string; text?: string }> };
    }>;
  };
  const content = payload.choices?.[0]?.message?.content;
  const text = Array.isArray(content)
    ? content
        .map((part) => part.text ?? "")
        .join("")
        .trim()
    : content?.trim();
  if (!text) throw new AiUnavailableError("OpenRouter returned no content.");
  return text;
}

export function stripJsonFence(text: string): string {
  const trimmed = text.trim();
  if (!trimmed.startsWith("```")) return trimmed;
  return trimmed
    .replace(/^```[a-zA-Z]*\n?/, "")
    .replace(/```$/, "")
    .trim();
}

export async function generateAiText(
  prompt: string,
  options?: { json?: boolean },
): Promise<string> {
  const json = options?.json ?? false;
  const provider = getAiProviderName();
  if (provider === "openrouter") {
    try {
      return await callOpenRouter(process.env["OPENROUTER_API_KEY"]!, prompt, json);
    } catch (error) {
      if (error instanceof DOMException && error.name === "TimeoutError")
        throw new AiUnavailableError("AI timed out. You can complete the field manually.");
      if (error instanceof AiUnavailableError) throw error;
      throw new AiUnavailableError(
        "AI assistance unavailable. You can complete this field manually.",
      );
    }
  }
  if (provider === "development-mock")
    return json
      ? JSON.stringify({
          strengths:
            "Development mock: review the strongest recorded factors and add evidence-based observations.",
          weaknesses:
            "Development mock: review the lowest recorded factors and add supported areas for improvement.",
          effectiveness:
            "Development mock: describe how the employee can improve effectiveness in the current role.",
          growthSuggestions:
            "Development mock: add practical development or training actions based on the evaluation.",
          otherComments:
            "Development mock: add career and development considerations based on documented evaluation context.",
        })
      : "[Development mock suggestion] Review the recorded evaluation factors and complete this field using your professional observations.";
  throw new AiUnavailableError("AI assistance unavailable. You can complete this field manually.");
}
