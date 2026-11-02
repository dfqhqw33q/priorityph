import { AlertCircle, CheckCircle2 } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  calculateWeightedScore,
  RATING_SCALE,
  type EvaluationTemplate,
} from "@/lib/performance-management";

export type EvaluationFormValues = {
  ratings: Record<string, number | null | undefined>;
  comments: Record<string, string>;
  evidence: Record<string, string>;
};

export function EvaluationForm({
  template,
  values,
  comparisonValues,
  onRatingChange,
  onCommentChange,
  onEvidenceChange,
  disabled = false,
}: {
  template: EvaluationTemplate;
  values: EvaluationFormValues;
  comparisonValues?: EvaluationFormValues;
  onRatingChange: (categoryId: string, rating: number | null) => void;
  onCommentChange: (categoryId: string, comment: string) => void;
  onEvidenceChange: (categoryId: string, evidence: string) => void;
  disabled?: boolean;
}) {
  const score = calculateWeightedScore(template, values.ratings);
  const categoryScoreById = new Map(
    score.categoryScores.map((categoryScore) => [categoryScore.categoryId, categoryScore]),
  );

  return (
    <div className="space-y-5">
      {template.categories.map((category, index) => {
        const categoryScore = categoryScoreById.get(category.id);
        const ratingSelectId = `rating-${category.id}`;
        const commentsId = `comments-${category.id}`;
        const evidenceId = `evidence-${category.id}`;

        return (
          <Card key={category.id}>
            <CardHeader className="gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="space-y-1">
                <CardTitle className="text-base">
                  {index + 1}. {category.name}
                </CardTitle>
                <p className="text-sm text-muted-foreground">Category weight: {category.weight}%</p>
              </div>
              <div className="shrink-0 rounded-lg bg-muted px-3 py-2 text-sm">
                <span className="text-muted-foreground">Weighted contribution: </span>
                <strong>
                  {categoryScore?.weightedContribution === null ||
                  categoryScore?.weightedContribution === undefined
                    ? "—"
                    : categoryScore.weightedContribution.toFixed(2)}
                </strong>
              </div>
            </CardHeader>
            <CardContent className="space-y-5">
              <div>
                <h3 className="text-sm font-medium">Performance indicators</h3>
                <ul className="mt-2 grid gap-2 text-sm text-muted-foreground sm:grid-cols-2">
                  {category.indicators.map((indicator) => (
                    <li key={indicator} className="flex gap-2">
                      <span aria-hidden="true">•</span>
                      <span>{indicator}</span>
                    </li>
                  ))}
                </ul>
              </div>

              {category.evidence.length > 0 ? (
                <div>
                  <h3 className="text-sm font-medium">Suggested supporting evidence</h3>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {category.evidence.join(" ")}
                  </p>
                </div>
              ) : null}

              <div
                className={
                  comparisonValues
                    ? "grid gap-4 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]"
                    : ""
                }
              >
                {comparisonValues ? (
                  <section
                    aria-label={`Employee self-assessment for ${category.name}`}
                    className="space-y-3 rounded-lg border bg-muted/30 p-4"
                  >
                    <h3 className="text-sm font-semibold">Employee self-assessment</h3>
                    <div>
                      <p className="text-xs font-medium text-muted-foreground">Rating</p>
                      <p className="mt-1 text-sm font-medium">
                        {formatRating(comparisonValues.ratings[category.id])}
                      </p>
                    </div>
                    <ResponseField
                      label="Comments or explanation"
                      value={comparisonValues.comments[category.id]}
                    />
                    <ResponseField
                      label="Evidence or examples"
                      value={comparisonValues.evidence[category.id]}
                    />
                  </section>
                ) : null}

                <section
                  aria-label={`Supervisor assessment for ${category.name}`}
                  className={comparisonValues ? "space-y-4 rounded-lg border p-4" : "space-y-5"}
                >
                  {comparisonValues ? (
                    <h3 className="text-sm font-semibold">Your assessment</h3>
                  ) : null}
                  <div className="grid gap-4 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
                    <div className="space-y-2">
                      <Label htmlFor={ratingSelectId}>Rating</Label>
                      <Select
                        value={values.ratings[category.id]?.toString() ?? ""}
                        disabled={disabled}
                        onValueChange={(value) =>
                          onRatingChange(category.id, value ? Number(value) : null)
                        }
                      >
                        <SelectTrigger
                          id={ratingSelectId}
                          aria-label={`Rating for ${category.name}`}
                        >
                          <SelectValue placeholder="Select a rating (1–5)" />
                        </SelectTrigger>
                        <SelectContent>
                          {RATING_SCALE.map((rating) => (
                            <SelectItem key={rating.value} value={rating.value.toString()}>
                              {rating.value} — {rating.label}: {rating.description}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <p className="text-xs text-muted-foreground">
                        {values.ratings[category.id]
                          ? RATING_SCALE.find(
                              (rating) => rating.value === values.ratings[category.id],
                            )?.description
                          : "Choose the rating that best reflects performance for this category."}
                      </p>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor={commentsId}>Comments or explanation</Label>
                      <Textarea
                        id={commentsId}
                        value={values.comments[category.id] ?? ""}
                        disabled={disabled}
                        onChange={(event) => onCommentChange(category.id, event.target.value)}
                        placeholder="Add context for this rating."
                        rows={3}
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor={evidenceId}>Evidence or examples</Label>
                    <Textarea
                      id={evidenceId}
                      value={values.evidence[category.id] ?? ""}
                      disabled={disabled}
                      onChange={(event) => onEvidenceChange(category.id, event.target.value)}
                      placeholder="Describe supporting evidence or relevant examples."
                      rows={2}
                    />
                  </div>
                </section>
              </div>
            </CardContent>
          </Card>
        );
      })}

      <Card>
        <CardHeader>
          <CardTitle>Weighted score summary</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="text-sm text-muted-foreground">Overall weighted score</p>
              <p className="mt-1 text-3xl font-semibold">
                {score.score === null ? "Incomplete" : `${score.score.toFixed(2)} / 5.00`}
              </p>
            </div>
            <p className="text-sm text-muted-foreground">
              Category weights total {score.weightTotal.toFixed(2)}%
            </p>
          </div>
          {!score.templateValid ? (
            <p className="flex items-center gap-2 text-sm text-destructive" role="alert">
              <AlertCircle className="size-4" />
              This template is invalid. It must contain eight categories totaling 100%.
            </p>
          ) : score.missingCategoryIds.length || score.invalidCategoryIds.length ? (
            <p className="flex items-center gap-2 text-sm text-muted-foreground" role="status">
              <AlertCircle className="size-4" />
              {score.missingCategoryIds.length} rating(s) missing and{" "}
              {score.invalidCategoryIds.length} invalid; a complete score requires a valid rating
              from 1 to 5 in every category.
            </p>
          ) : (
            <p className="flex items-center gap-2 text-sm text-emerald-700 dark:text-emerald-400">
              <CheckCircle2 className="size-4" />
              All eight category ratings are valid.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function formatRating(rating: number | null | undefined) {
  if (rating === null || rating === undefined) return "Not rated";
  const label = RATING_SCALE.find((item) => item.value === rating)?.label;
  return label ? `${rating} — ${label}` : `${rating} / 5`;
}

function ResponseField({ label, value }: { label: string; value: string | undefined }) {
  return (
    <div>
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p className="mt-1 whitespace-pre-wrap break-words text-sm">
        {value?.trim() || "No response provided."}
      </p>
    </div>
  );
}
