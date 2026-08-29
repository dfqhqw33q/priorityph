import { RATING_SCALE, type Criterion, type RatingRow } from "@/lib/domain";
import { cn } from "@/lib/utils";

export function ratingFor(ratings: RatingRow[], criterionId: string, evaluator: RatingRow["evaluator_type"]) {
  return ratings.find((row) => row.criterion_id === criterionId && row.evaluator_type === evaluator)?.rating ?? null;
}

export function RatingMatrix({
  criteria,
  values,
  onChange,
  readOnly,
  employeeValues,
  supervisorValues,
}: {
  criteria: Criterion[];
  values: Record<string, number>;
  onChange?: (criterionId: string, value: number) => void;
  readOnly?: boolean;
  employeeValues?: Record<string, number | null>;
  supervisorValues?: Record<string, number | null>;
}) {
  return (
    <div className="space-y-5">
      {criteria.map((criterion) => {
        const selected = values[criterion.id] ?? null;
        return (
          <div key={criterion.id} className="rounded-xl border border-border bg-card p-4 shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <p className="text-sm font-semibold text-foreground">
                  {criterion.letter}. {criterion.title}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">{criterion.description}</p>
              </div>
              {employeeValues ? (
                <span className="rounded-md border border-border bg-muted/60 px-2.5 py-1 text-xs font-medium text-muted-foreground">
                  Employee: {employeeValues[criterion.id] ?? "—"}
                </span>
              ) : null}
            </div>
            <div className="mt-4 grid grid-cols-5 gap-2">
              {RATING_SCALE.map((scale) => {
                const active = selected === scale.value;
                return (
                  <button
                    key={scale.value}
                    type="button"
                    disabled={readOnly}
                    onClick={() => onChange?.(criterion.id, scale.value)}
                    className={cn(
                      "flex flex-col items-center gap-1 rounded-lg border px-1 py-2 text-[11px] font-medium transition-all cursor-pointer",
                      active
                        ? "border-primary bg-primary text-primary-foreground font-bold shadow-sm ring-1 ring-primary"
                        : "border-border bg-background text-muted-foreground hover:border-primary/40 hover:bg-accent hover:text-accent-foreground",
                      readOnly && "cursor-default opacity-80",
                    )}
                  >
                    <span className="text-sm font-bold">{scale.value}</span>
                    <span className="leading-tight">{scale.label}</span>
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function EvaluationRatingCards({
  criteria,
  values,
  onChange,
  readOnly,
  employeeValues,
  errorCriterionIds = [],
}: {
  criteria: Criterion[];
  values: Record<string, number | null>;
  onChange?: (criterionId: string, value: number) => void;
  readOnly?: boolean;
  employeeValues?: Record<string, number | null>;
  errorCriterionIds?: string[];
}) {
  return (
    <div className="space-y-5">
      {criteria.map((criterion) => {
        const selected = values[criterion.id] ?? null;
        const invalid = errorCriterionIds.includes(criterion.id);
        return (
          <fieldset key={criterion.id} className={cn("rounded-xl border border-border bg-card p-4 shadow-sm", invalid && "border-destructive")}>
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <legend className="text-sm font-semibold text-foreground">{criterion.letter}. {criterion.title}</legend>
                <p className="mt-1 text-xs text-muted-foreground">{criterion.description}</p>
              </div>
              {employeeValues ? <span className="rounded-md border border-border bg-muted/60 px-2.5 py-1 text-xs font-medium text-muted-foreground">Employee: {employeeValues[criterion.id] ?? "—"}</span> : null}
            </div>
            <div className="mt-4 grid grid-cols-5 gap-2">
              {RATING_SCALE.map((scale) => {
                const active = selected === scale.value;
                return (
                  <label key={scale.value} className={cn("flex cursor-pointer flex-col items-center gap-1 rounded-lg border px-1 py-2.5 text-center text-[11px] font-medium transition-all", active ? "border-primary bg-primary text-primary-foreground font-bold shadow-sm ring-1 ring-primary" : "border-border bg-background text-muted-foreground hover:border-primary/40 hover:bg-accent hover:text-accent-foreground", readOnly && "cursor-default opacity-80")}>
                    <input type="radio" className="sr-only" name={`supervisor-${criterion.id}`} value={scale.value} checked={active} disabled={readOnly} onChange={() => onChange?.(criterion.id, scale.value)} />
                    <span className="text-sm font-bold">{scale.value}</span>
                    <span className="leading-tight">{scale.label}</span>
                  </label>
                );
              })}
            </div>
            {invalid ? <p className="mt-2 text-xs font-medium text-destructive">Select a rating from 1 to 5.</p> : null}
          </fieldset>
        );
      })}
    </div>
  );
}

/**
 * Accessible one-row-per-factor rating table using five mutually exclusive
 * radio buttons. Used by the Supervisor review screen.
 */
export function RadioRatingMatrix({
  criteria,
  values,
  onChange,
  readOnly,
  employeeValues,
  supervisorValues,
  finalScore,
  name,
  errorCriterionIds = [],
}: {
  criteria: Criterion[];
  values: Record<string, number | null>;
  onChange?: (criterionId: string, value: number) => void;
  readOnly?: boolean;
  employeeValues?: Record<string, number | null>;
  supervisorValues?: Record<string, number | null>;
  finalScore?: number | null;
  name: string;
  errorCriterionIds?: string[];
}) {
  return (
    <div className="overflow-x-auto rounded-xl border border-border bg-card shadow-sm">
      <table className="w-full border-collapse text-sm">
        <caption className="sr-only">
          Performance evaluation factors A to J, rated from 1 (poor) to 5 (excellent)
        </caption>
        <thead>
          <tr className="border-b border-border bg-muted/60 text-left">
            <th scope="col" className="p-3.5 font-semibold text-foreground">
              Performance evaluation factor
            </th>
            {employeeValues ? (
              <th scope="col" className="p-3.5 text-center font-semibold text-foreground whitespace-nowrap">
                Employee
              </th>
            ) : null}
            {supervisorValues ? (
              <th scope="col" className="p-3.5 text-center font-semibold text-foreground whitespace-nowrap">
                Supervisor
              </th>
            ) : null}
            {RATING_SCALE.map((scale) => (
              <th key={scale.value} scope="col" className="p-2 text-center text-foreground">
                <span className="block font-bold">{scale.value}</span>
                <span className="block text-[10px] font-medium text-muted-foreground">
                  {scale.label}
                </span>
              </th>
            ))}
            {finalScore !== undefined ? (
              <th scope="col" className="p-3.5 text-center font-semibold text-foreground whitespace-nowrap">
                Final Score
              </th>
            ) : null}
          </tr>
        </thead>
        <tbody>
          {criteria.map((criterion) => {
            const invalid = errorCriterionIds.includes(criterion.id);
            return (
              <tr
                key={criterion.id}
                className={cn(
                  "border-b border-border transition-colors hover:bg-muted/30 last:border-0",
                  invalid && "bg-destructive/10",
                )}
              >
                <th scope="row" className="max-w-md p-3.5 text-left align-top font-normal">
                  <span className="font-semibold text-foreground">
                    {criterion.letter}. {criterion.title}
                  </span>
                  <span className="mt-1 block text-xs text-muted-foreground">
                    {criterion.description}
                  </span>
                  {invalid ? (
                    <span className="mt-1 block text-xs font-medium text-destructive">
                      Select a rating from 1 to 5.
                    </span>
                  ) : null}
                </th>
                {employeeValues ? (
                  <td className="p-3.5 text-center tabular-nums font-medium text-foreground">
                    {employeeValues[criterion.id] ?? "—"}
                  </td>
                ) : null}
                {supervisorValues ? (
                  <td className="p-3.5 text-center tabular-nums font-medium text-foreground">
                    {supervisorValues[criterion.id] ?? "—"}
                  </td>
                ) : null}
                {RATING_SCALE.map((scale) => (
                  <td key={scale.value} className="p-2 text-center">
                    <input
                      type="radio"
                      className="size-4 accent-primary cursor-pointer disabled:cursor-default"
                      name={`${name}-${criterion.id}`}
                      value={scale.value}
                      disabled={readOnly}
                      checked={values[criterion.id] === scale.value}
                      onChange={() => onChange?.(criterion.id, scale.value)}
                      aria-label={`${criterion.letter} ${criterion.title}: ${scale.value} ${scale.label}`}
                    />
                  </td>
                ))}
                {finalScore !== undefined && criterion === criteria[0] ? (
                  <td rowSpan={criteria.length} className="p-3.5 text-center align-middle text-xl font-bold tabular-nums text-primary">
                    {finalScore === null ? "—" : finalScore.toFixed(2)}
                  </td>
                ) : null}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
