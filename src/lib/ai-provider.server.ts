/**
 * Server-side AI text generation for President review assistance.
 *
 * Uses Google Gemini when GEMINI_API_KEY is configured. A deterministic mock is
 * available only when explicitly enabled outside production for local testing.
 */

export class AiUnavailableError extends Error {}

export type AiProviderName = "gemini" | "development-mock" | "unavailable";

export function getAiProviderName(): AiProviderName {
  if (process.env["GEMINI_API_KEY"]) return "gemini";
  if (process.env["AI_PROVIDER"] === "mock" && process.env["NODE_ENV"] !== "production")
    return "development-mock";
  return "unavailable";
}

function timeoutSignal(milliseconds: number): AbortSignal {
  return AbortSignal.timeout ? AbortSignal.timeout(milliseconds) : new AbortController().signal;
}

async function callGemini(apiKey: string, prompt: string, json: boolean): Promise<string> {
  const model = process.env["GEMINI_MODEL"] || "gemini-2.5-flash";
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      signal: timeoutSignal(15_000),
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        ...(json ? { generationConfig: { responseMimeType: "application/json" } } : {}),
      }),
    },
  );
  if (!response.ok) throw new AiUnavailableError(`Gemini request failed (${response.status}).`);
  const payload = (await response.json()) as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  };
  const text = payload.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
  if (!text) throw new AiUnavailableError("Gemini returned no content.");
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
  if (provider === "gemini") {
    try {
      return await callGemini(process.env["GEMINI_API_KEY"]!, prompt, json);
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
          performanceSummary: "Development mock output",
          strengths: [],
          areasForImprovement: [],
          developmentRecommendations: [],
          trainingRecommendations: [],
          coachingSuggestions: [],
        })
      : "[Development mock suggestion] Review the recorded evaluation factors and complete this field using your professional observations.";
  throw new AiUnavailableError("AI assistance unavailable. You can complete this field manually.");
}
