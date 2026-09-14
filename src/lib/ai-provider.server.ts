/**
 * Server-side AI text generation for evaluation assistance.
 *
 * Uses OpenRouter when OPENROUTER_API_KEY is configured. A deterministic mock
 * is available only when explicitly enabled outside production for local testing.
 */

export class AiUnavailableError extends Error {}

const evaluationMetaLanguage =
  /\b(?:the\s+)?(?:supervisor(?:'s)?|reviewing supervisor|immediate supervisor|evaluator|evaluation process|system|ai|model)\b/i;

export function rewriteEvaluationText(text: string): string {
  return text
    .replace(
      /\bThe Supervisor ratings indicate areas for improvement in\b/gi,
      "Further development in",
    )
    .replace(
      /\bThe Supervisor assessment reflects solid performance in\b/gi,
      "The employee demonstrates solid performance in",
    )
    .replace(
      /\bThe Reviewing Supervisor ratings place the employee at a satisfactory level\b/gi,
      "The employee demonstrates satisfactory overall performance",
    )
    .trim();
}

export function containsEvaluationMetaLanguage(text: string): boolean {
  return evaluationMetaLanguage.test(text);
}

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
            "The employee demonstrates strengths in the highest-rated performance factors.",
          weaknesses: "Further development is recommended in the lower-rated performance factors.",
          effectiveness:
            "The employee can improve present-job effectiveness by focusing on the lower-rated performance factors.",
          q1Explanation: null,
          developmentPotential: {
            recommendedOption: "Only moderate improvement ahead on present job",
            reason: "The current ratings support continued development in the present job.",
          },
          advancementOutlook: {
            recommendedOption:
              "Present job or jobs within the same grade level represent his advancement.",
            reason: "The current ratings support advancement within the same grade level.",
          },
          growthSuggestions:
            "Targeted coaching, guided practice, and job-specific training may support further growth.",
          otherComments:
            "The employee's current performance supports focused development in the identified areas.",
          recommendedTraining:
            "Targeted job-specific development in an identified performance area.",
          relatedCompetency: null,
          rationale:
            "Focused development may strengthen the employee's capability in an area identified by the evaluation.",
          trainingFocus: "Guided practice and applied skill development.",
          details:
            "The Committee should review the evidence and decide whether formal training is required.",
        })
      : "The employee's recorded performance supports a concise, evidence-based evaluation statement.";
  throw new AiUnavailableError("AI assistance unavailable. You can complete this field manually.");
}
