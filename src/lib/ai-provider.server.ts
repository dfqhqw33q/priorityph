/**
 * Server-side AI text generation for President review assistance.
 *
 * Uses Google Gemini when GEMINI_API_KEY is configured, and otherwise falls back
 * to the Lovable AI Gateway (LOVABLE_API_KEY). Both keys stay server-side.
 */

const GATEWAY_URL = "https://ai.gateway.lovable.dev/v1/responses";
const GATEWAY_MODEL = "openai/gpt-5.6-sol";

export class AiUnavailableError extends Error {}

async function callGemini(apiKey: string, prompt: string, json: boolean): Promise<string> {
  const model = process.env["GEMINI_MODEL"] || "gemini-2.5-flash";
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
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

async function callLovableGateway(apiKey: string, prompt: string, json: boolean): Promise<string> {
  const response = await fetch(GATEWAY_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Lovable-API-Key": apiKey,
      "X-Lovable-AIG-SDK": "fetch",
    },
    body: JSON.stringify({
      model: GATEWAY_MODEL,
      input: json ? `${prompt}\n\nReturn only valid JSON. No markdown fences.` : prompt,
      stream: true,
      reasoning: { effort: "low", summary: "auto" },
    }),
  });

  if (response.status === 429) throw new AiUnavailableError("AI is rate limited. Try again shortly.");
  if (response.status === 402) throw new AiUnavailableError("AI credits are exhausted for this workspace.");
  if (!response.ok || !response.body) {
    throw new AiUnavailableError(`AI request failed (${response.status}).`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let text = "";
  while (true) {
    const chunk = await reader.read();
    if (chunk.done) break;
    buffer += decoder.decode(chunk.value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      if (!line.startsWith("data:")) continue;
      const raw = line.slice(5).trim();
      if (!raw || raw === "[DONE]") continue;
      try {
        const event = JSON.parse(raw) as { type?: string; delta?: string; response?: { output_text?: string } };
        if (event.type === "response.output_text.delta" && typeof event.delta === "string") {
          text += event.delta;
        } else if (event.type === "response.completed" && !text && event.response?.output_text) {
          text = event.response.output_text;
        }
      } catch {
        // Ignore keep-alive or non-JSON frames.
      }
    }
  }

  const result = text.trim();
  if (!result) throw new AiUnavailableError("AI returned no content.");
  return result;
}

export function stripJsonFence(text: string): string {
  const trimmed = text.trim();
  if (!trimmed.startsWith("```")) return trimmed;
  return trimmed.replace(/^```[a-zA-Z]*\n?/, "").replace(/```$/, "").trim();
}

export async function generateAiText(prompt: string, options?: { json?: boolean }): Promise<string> {
  const json = options?.json ?? false;
  const geminiKey = process.env["GEMINI_API_KEY"];
  const lovableKey = process.env["LOVABLE_API_KEY"];

  if (geminiKey) {
    try {
      return await callGemini(geminiKey, prompt, json);
    } catch (error) {
      if (!lovableKey) throw error;
    }
  }

  if (!lovableKey) throw new AiUnavailableError("AI assistance is not configured on this server.");
  return callLovableGateway(lovableKey, prompt, json);
}
