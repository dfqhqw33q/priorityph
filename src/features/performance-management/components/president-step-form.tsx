import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { AlertTriangle, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useState } from "react";
import type { PresidentStepData } from "@/lib/domain";
import { hasAiMapping, type AiSuggestionResult } from "@/lib/ai-suggestions";

/**
 * AI drafting is advisory only. A generated suggestion is shown in its own
 * panel and is copied into the field only when the President clicks
 * "Use suggestion" or "Edit before use". Nothing is auto-saved or submitted,
 * and an unaccepted suggestion is never persisted.
 */
export function PresidentStepFields({
  step,
  values,
  onChange,
  readOnly,
  errors,
  onAiSuggest,
  onAiDecision,
}: {
  step: PresidentStepData;
  values: Record<string, string>;
  onChange: (itemId: string, value: string) => void;
  readOnly: boolean;
  errors: string[];
  onAiSuggest?: (itemId: string, currentValue: string) => Promise<AiSuggestionResult>;
  onAiDecision?: (itemId: string, decision: "ACCEPTED" | "DISMISSED", edited: boolean) => void;
}) {
  const [suggestingItemId, setSuggestingItemId] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<Record<string, AiSuggestionResult>>({});
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [editing, setEditing] = useState<Record<string, boolean>>({});
  const [showEvidence, setShowEvidence] = useState<Record<string, boolean>>({});

  function closePanel(itemId: string) {
    setSuggestions((current) => {
      const next = { ...current };
      delete next[itemId];
      return next;
    });
    setDrafts((current) => {
      const next = { ...current };
      delete next[itemId];
      return next;
    });
    setEditing((current) => ({ ...current, [itemId]: false }));
    setShowEvidence((current) => ({ ...current, [itemId]: false }));
  }

  return (
    <div className="space-y-6">
      {step.items.map((item) => {
        const value = values[item.id] ?? "";
        const invalid = errors.includes(item.id);
        const describedBy = item.help_text ? `${item.id}-help` : undefined;
        const isTextField = item.input_type === "TEXT" || item.input_type === "LONG_TEXT";
        const aiEligible = Boolean(onAiSuggest) && !readOnly && isTextField && hasAiMapping(item.code);
        const suggestion = suggestions[item.id];

        return (
          <div key={item.id} className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <Label htmlFor={item.id}>
                {item.label}
                {item.is_required ? <span className="ml-1 text-destructive">*</span> : null}
              </Label>
              {aiEligible ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-7 gap-1.5 text-xs"
                  disabled={suggestingItemId !== null}
                  onClick={async () => {
                    setSuggestingItemId(item.id);
                    try {
                      const result = await onAiSuggest!(item.id, value);
                      setSuggestions((current) => ({ ...current, [item.id]: result }));
                      setDrafts((current) => ({ ...current, [item.id]: result.suggestion }));
                      setEditing((current) => ({ ...current, [item.id]: false }));
                    } finally {
                      setSuggestingItemId(null);
                    }
                  }}
                >
                  <Sparkles className={suggestingItemId === item.id ? "size-3.5 animate-spin" : "size-3.5"} />
                  {suggestingItemId === item.id ? "Generating…" : "Generate AI suggestion"}
                </Button>
              ) : null}
            </div>
            {item.help_text ? (
              <p id={`${item.id}-help`} className="text-xs text-muted-foreground">
                {item.help_text}
              </p>
            ) : null}

            {item.input_type === "LONG_TEXT" ? (
              <Textarea
                id={item.id}
                rows={5}
                maxLength={4000}
                value={value}
                disabled={readOnly}
                aria-invalid={invalid}
                aria-describedby={describedBy}
                onChange={(event) => onChange(item.id, event.target.value)}
              />
            ) : item.input_type === "TEXT" ? (
              <Input
                id={item.id}
                maxLength={400}
                value={value}
                disabled={readOnly}
                aria-invalid={invalid}
                aria-describedby={describedBy}
                onChange={(event) => onChange(item.id, event.target.value)}
              />
            ) : (
              <RadioGroup
                value={value}
                disabled={readOnly}
                onValueChange={(next) => onChange(item.id, next)}
                className="flex flex-wrap gap-4"
                aria-label={item.label}
              >
                {(item.input_type === "YES_NO" ? ["Yes", "No"] : item.options).map((option) => (
                  <div key={option} className="flex items-center gap-2">
                    <RadioGroupItem id={`${item.id}-${option}`} value={option} />
                    <Label htmlFor={`${item.id}-${option}`} className="font-normal">
                      {option}
                    </Label>
                  </div>
                ))}
              </RadioGroup>
            )}

            {suggestion ? (
              <div
                className="rounded-md border border-border bg-surface-muted p-3 space-y-3"
                role="region"
                aria-label={`AI suggestion for ${item.label}`}
              >
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  AI suggestion (advisory — not saved until you accept it)
                </p>

                {suggestion.disagreementWarning ? (
                  <p className="flex gap-2 rounded-md border border-warning/40 bg-warning/10 p-2 text-xs text-foreground">
                    <AlertTriangle className="size-4 shrink-0 text-warning" />
                    <span>{suggestion.disagreementWarning}</span>
                  </p>
                ) : null}

                {editing[item.id] ? (
                  <Textarea
                    rows={5}
                    maxLength={4000}
                    aria-label={`Edit AI suggestion for ${item.label}`}
                    value={drafts[item.id] ?? ""}
                    onChange={(event) =>
                      setDrafts((current) => ({ ...current, [item.id]: event.target.value }))
                    }
                  />
                ) : (
                  <p className="whitespace-pre-wrap text-sm text-foreground">{suggestion.suggestion}</p>
                )}

                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    size="sm"
                    onClick={() => {
                      const edited = Boolean(editing[item.id]);
                      onChange(item.id, (drafts[item.id] ?? suggestion.suggestion).trim());
                      onAiDecision?.(item.id, "ACCEPTED", edited);
                      closePanel(item.id);
                    }}
                  >
                    Use suggestion
                  </Button>
                  {!editing[item.id] ? (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => setEditing((current) => ({ ...current, [item.id]: true }))}
                    >
                      Edit before use
                    </Button>
                  ) : null}
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() =>
                      setShowEvidence((current) => ({ ...current, [item.id]: !current[item.id] }))
                    }
                  >
                    {showEvidence[item.id] ? "Hide evidence" : "View evidence"}
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      onAiDecision?.(item.id, "DISMISSED", false);
                      closePanel(item.id);
                    }}
                  >
                    Dismiss
                  </Button>
                </div>

                {showEvidence[item.id] ? (
                  <div className="space-y-2 border-t border-border pt-2 text-xs text-muted-foreground">
                    <p>{suggestion.evidence.purpose}</p>
                    <p>
                      Based only on {suggestion.evidence.employeeName} — {suggestion.evidence.cycle}.
                    </p>
                    <ul className="space-y-0.5">
                      {suggestion.evidence.factors.map((factor) => (
                        <li key={factor.letter}>
                          {factor.letter}. {factor.title} — employee {factor.employeeRating ?? "—"}, supervisor{" "}
                          {factor.supervisorRating ?? "—"}, president {factor.presidentRating ?? "—"}
                        </li>
                      ))}
                    </ul>
                    {suggestion.evidence.finalScore !== null ? (
                      <p>
                        Final score {suggestion.evidence.finalScore}
                        {suggestion.evidence.finalRatingLabel ? ` (${suggestion.evidence.finalRatingLabel})` : ""}
                      </p>
                    ) : null}
                  </div>
                ) : null}
              </div>
            ) : null}

            {invalid ? <p className="text-xs text-destructive">This answer is required.</p> : null}
          </div>
        );
      })}
    </div>
  );
}
