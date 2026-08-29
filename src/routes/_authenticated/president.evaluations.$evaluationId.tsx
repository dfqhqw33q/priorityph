import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { PrintEvaluationSheet } from "@/components/print-evaluation-sheet";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  EmptyState,
  EvaluationStatusBadge,
  LoadingBlock,
  PageHeader,
  formatDateTime,
} from "@/components/ui-bits";
import { RadioRatingMatrix, ratingFor } from "@/components/rating-matrix";
import { PresidentStepFields } from "@/components/president-step-form";
import { useAccess } from "@/hooks/use-access";
import { getEvaluation } from "@/lib/evaluations.functions";
import { getPresidentSteps, savePresidentRatings, savePresidentStepAnswers } from "@/lib/president.functions";
import { userErrorMessage } from "@/lib/validation";
import { getEvaluationScore } from "@/lib/scoring.functions";
import { recordAiSuggestionDecision, suggestPresidentField } from "@/lib/ai.functions";
import type { AiSuggestionResult } from "@/lib/ai-suggestions";
import { finalizeEvaluation, returnForCorrection } from "@/lib/scoring.functions";
import type { PresidentStepData } from "@/lib/domain";
import { ReasonDialog } from "@/components/ui-bits";

export const Route = createFileRoute("/_authenticated/president/evaluations/$evaluationId")({
  head: () => ({
    meta: [
      { title: "President review | Priority Handling Logistics, Inc." },
      {
        name: "description",
        content: "Read Step 1 ratings, then complete Step 2 conclusions and Step 3 reviewing supervisor sign-off.",
      },
      { property: "og:title", content: "President review" },
      { property: "og:description", content: "Complete Step 2 and Step 3 of the performance evaluation." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: PresidentReviewPage,
});

function PresidentReviewPage() {
  const { evaluationId } = Route.useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { can } = useAccess();

  const fetchEvaluation = useServerFn(getEvaluation);
  const fetchSteps = useServerFn(getPresidentSteps);
  const saveStep = useServerFn(savePresidentStepAnswers);
  const saveRatings = useServerFn(savePresidentRatings);
  const fetchScore = useServerFn(getEvaluationScore);
  const suggestAi = useServerFn(suggestPresidentField);
  const recordDecision = useServerFn(recordAiSuggestionDecision);
  const finalize = useServerFn(finalizeEvaluation);
  const returnCorrection = useServerFn(returnForCorrection);

  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [presidentRatings, setPresidentRatings] = useState<Record<string, number>>({});
  const [errors, setErrors] = useState<string[]>([]);
  const [confirm, setConfirm] = useState<2 | 3 | null>(null);
  const [action, setAction] = useState<"finalize" | "return" | null>(null);

  const evaluationQuery = useQuery({
    queryKey: ["evaluation", evaluationId],
    queryFn: () => fetchEvaluation({ data: { evaluationId } }),
    retry: false,
  });

  const stepsQuery = useQuery({
    queryKey: ["president-steps", evaluationId],
    queryFn: () => fetchSteps({ data: { evaluationId } }),
    retry: false,
  });

  const scoreQuery = useQuery({
    queryKey: ["evaluation-score", evaluationId],
    queryFn: () => fetchScore({ data: { evaluationId } }),
    retry: false,
  });

  const detail = evaluationQuery.data ?? null;
  const steps = stepsQuery.data ?? null;

  useEffect(() => {
    if (!steps) return;
    setAnswers({ ...(steps.step2?.answers ?? {}), ...(steps.step3?.answers ?? {}) });
  }, [steps]);

  useEffect(() => {
    if (!detail) return;
    const values: Record<string, number> = {};
    for (const criterion of detail.criteria) {
      const rating = ratingFor(detail.ratings, criterion.id, "PRESIDENT");
      if (rating !== null) values[criterion.id] = rating;
    }
    setPresidentRatings(values);
  }, [detail]);

  const employeeValues = useMemo(() => {
    const map: Record<string, number | null> = {};
    for (const criterion of detail?.criteria ?? []) {
      map[criterion.id] = ratingFor(detail?.ratings ?? [], criterion.id, "EMPLOYEE");
    }
    return map;
  }, [detail]);

  const supervisorValues = useMemo(() => {
    const map: Record<string, number | null> = {};
    for (const criterion of detail?.criteria ?? []) {
      map[criterion.id] = ratingFor(detail?.ratings ?? [], criterion.id, "SUPERVISOR");
    }
    return map;
  }, [detail]);

  const mutation = useMutation({
    mutationFn: (input: { step: 2 | 3; submit: boolean }) =>
      saveStep({
        data: {
          evaluationId,
          step: input.step,
          version: detail?.version ?? 1,
          submit: input.submit,
          answers: itemsFor(steps, input.step).map((item) => ({
            itemId: item.id,
            value: answers[item.id] ?? "",
          })),
        },
      }),
    onSuccess: async (result) => {
      toast.success(result.submitted ? "Step submitted" : "Draft saved");
      setConfirm(null);
      await queryClient.invalidateQueries({ queryKey: ["president-steps", evaluationId] });
      await queryClient.invalidateQueries({ queryKey: ["evaluation", evaluationId] });
      await queryClient.invalidateQueries({ queryKey: ["president-queue"] });
    },
    onError: (error: Error) => toast.error(userErrorMessage(error, "Step could not be saved")),
  });

  const ratingsMutation = useMutation({
    mutationFn: () =>
      saveRatings({
        data: {
          evaluationId,
          version: detail?.version ?? 1,
          ratings: (detail?.criteria ?? []).map((criterion) => ({
            criterionId: criterion.id,
            rating: presidentRatings[criterion.id] ?? 0,
          })),
        },
      }),
    onSuccess: async () => {
      toast.success("President ratings saved and score recalculated");
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["evaluation", evaluationId] }),
        queryClient.invalidateQueries({ queryKey: ["evaluation-score", evaluationId] }),
      ]);
    },
    onError: (error: Error) => toast.error(userErrorMessage(error, "President ratings could not be saved")),
  });

  /**
   * Requests an advisory draft. The result is returned to the field panel; it
   * is never written into the answer or saved until the President accepts it.
   */
  async function suggestField(itemId: string, step: 2 | 3, currentValue: string) {
    try {
      return await suggestAi({
        data: { evaluationId, version: detail?.version ?? 1, itemId, step, currentValue },
      });
    } catch (error) {
      toast.error(userErrorMessage(error, "AI suggestion unavailable"));
      throw error;
    }
  }

  function recordAiDecision(itemId: string, step: 2 | 3, decision: "ACCEPTED" | "DISMISSED", edited: boolean) {
    void recordDecision({
      data: { evaluationId, version: detail?.version ?? 1, itemId, step, decision, edited },
    }).catch(() => undefined);
  }

  const actionMutation = useMutation({
    mutationFn: (input: { kind: "finalize" | "return"; reason: string }) =>
      input.kind === "finalize"
        ? finalize({ data: { evaluationId, version: detail?.version ?? 1, reason: input.reason } })
        : returnCorrection({ data: { evaluationId, version: detail?.version ?? 1, reason: input.reason } }),
    onSuccess: async () => {
      setAction(null);
      toast.success("Evaluation updated");
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["evaluation", evaluationId] }),
        queryClient.invalidateQueries({ queryKey: ["president-queue"] }),
        queryClient.invalidateQueries({ queryKey: ["evaluation-history"] }),
      ]);
    },
    onError: (error: Error) => toast.error(userErrorMessage(error, "Evaluation update failed")),
  });

  function requestSubmit(step: 2 | 3) {
    const missing = itemsFor(steps, step)
      .filter((item) => item.is_required && !(answers[item.id] ?? "").trim())
      .map((item) => item.id);
    setErrors(missing);
    if (missing.length > 0) {
      toast.error("Complete all required questions before submitting");
      return;
    }
    setConfirm(step);
  }

  if (evaluationQuery.isLoading || stepsQuery.isLoading) return <LoadingBlock rows={6} />;
  if (evaluationQuery.isError || stepsQuery.isError) {
    const error = evaluationQuery.error ?? stepsQuery.error;
    return (
      <EmptyState
        title="Unable to open this evaluation"
        description={error instanceof Error ? error.message : "Unavailable"}
      />
    );
  }
  if (!detail) return <EmptyState title="Evaluation not found" description="It may have been removed." />;

  const step2Locked = steps?.step2?.isLocked ?? false;
  const step3Locked = steps?.step3?.isLocked ?? false;
  const canFinalize = can("evaluations.finalize") && detail.status === "READY_FOR_FINALIZATION" && !detail.is_finalized;
  const canReturn = can("evaluations.correct") && !detail.is_finalized && detail.status !== "RETURNED_FOR_CORRECTION";

  return (
    <>
    <div className="space-y-6 print:hidden">
      <PageHeader
        title={detail.full_name_snapshot}
        description={`${detail.cycle_name} (${detail.cycle_year}) · Employee no. ${detail.employee_number_snapshot}`}
        actions={<EvaluationStatusBadge status={detail.status} />}
      />

      <Tabs defaultValue="step1">
        <TabsList>
          <TabsTrigger value="step1">Ratings</TabsTrigger>
          <TabsTrigger value="step2">Step 2 — Conclusions</TabsTrigger>
          <TabsTrigger value="step3">Step 3 — Reviewing supervisor</TabsTrigger>
        </TabsList>

        <TabsContent value="step1" className="space-y-6 pt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">President ratings</CardTitle>
              <CardDescription>Rate each applicable factor from 1 to 5. These ratings determine the official final score.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <RadioRatingMatrix
                name="president"
                criteria={detail.criteria}
                values={presidentRatings}
                employeeValues={employeeValues}
                supervisorValues={supervisorValues}
                finalScore={scoreQuery.data?.score?.finalScore ?? null}
                onChange={(criterionId, value) => {
                  ratingsMutation.reset();
                  setPresidentRatings((current) => ({ ...current, [criterionId]: value }));
                }}
                readOnly={detail.is_finalized || step3Locked || !can("president.view")}
                errorCriterionIds={[]}
              />
              <Button
                onClick={() => ratingsMutation.mutate()}
                disabled={ratingsMutation.isPending || detail.is_finalized || step3Locked || Object.keys(presidentRatings).length !== detail.criteria.length}
              >
                {ratingsMutation.isPending
                  ? "Saving..."
                  : ratingsMutation.isSuccess
                    ? "Saved"
                    : ratingsMutation.isError
                      ? "Save failed"
                      : "Save President Ratings"}
              </Button>
              <div className="rounded-lg border border-border bg-muted/50 p-4 text-sm">
                <span className="font-semibold text-foreground">Overall Final Score: </span>
                {scoreQuery.isLoading ? (
                  <span className="text-muted-foreground">Calculating final score...</span>
                ) : scoreQuery.isError ? (
                  <span className="text-destructive">
                    {scoreQuery.error instanceof Error ? scoreQuery.error.message : "Unable to load the final score."}{" "}
                    <button type="button" className="underline" onClick={() => void scoreQuery.refetch()}>
                      Retry
                    </button>
                  </span>
                ) : (
                  <>
                    <span className="font-bold text-primary tabular-nums">
                      {typeof scoreQuery.data?.score?.finalScore === "number"
                        ? scoreQuery.data.score.finalScore.toFixed(2)
                        : "Complete all President ratings to calculate"}
                    </span>
                    {scoreQuery.data?.score?.finalRatingLabel ? (
                      <span className="ml-1.5 font-bold text-foreground">({scoreQuery.data.score.finalRatingLabel})</span>
                    ) : null}
                  </>
                )}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Employee information</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 text-sm sm:grid-cols-2 lg:grid-cols-3">
              <Field label="Employee number" value={detail.employee_number_snapshot} />
              <Field label="Full name" value={detail.full_name_snapshot} />
              <Field label="Job title" value={detail.job_title_snapshot} />
              <Field label="Division / department" value={detail.division_snapshot} />
              <Field label="Section / unit" value={detail.section_snapshot} />
              <Field label="Supervisor review submitted" value={formatDateTime(detail.supervisor_submitted_at)} />
            </CardContent>
          </Card>

        </TabsContent>

        <TabsContent value="step2" className="pt-4">
          <StepPanel
            step={steps?.step2 ?? null}
            locked={step2Locked}
            canEdit={can("president.step2")}
            onAiSuggest={(itemId, value) => suggestField(itemId, 2, value)}
            onAiDecision={(itemId, decision, edited) => recordAiDecision(itemId, 2, decision, edited)}
            answers={answers}
            errors={errors}
            pending={mutation.isPending}
            onChange={(itemId, value) => {
              setAnswers((prev) => ({ ...prev, [itemId]: value }));
              setErrors((prev) => prev.filter((id) => id !== itemId));
            }}
            onSaveDraft={() => mutation.mutate({ step: 2, submit: false })}
            onSubmit={() => requestSubmit(2)}
          />
        </TabsContent>

        <TabsContent value="step3" className="pt-4">
          {!step2Locked ? (
            <EmptyState
              title="Complete Step 2 first"
              description="Submit your Step 2 conclusions before starting the reviewing supervisor section."
            />
          ) : (
            <StepPanel
              step={steps?.step3 ?? null}
              locked={step3Locked}
              canEdit={can("president.step3")}
              onAiSuggest={(itemId, value) => suggestField(itemId, 3, value)}
            onAiDecision={(itemId, decision, edited) => recordAiDecision(itemId, 3, decision, edited)}
              answers={answers}
              errors={errors}
              pending={mutation.isPending}
              onChange={(itemId, value) => {
                setAnswers((prev) => ({ ...prev, [itemId]: value }));
                setErrors((prev) => prev.filter((id) => id !== itemId));
              }}
              onSaveDraft={() => mutation.mutate({ step: 3, submit: false })}
              onSubmit={() => requestSubmit(3)}
            />
          )}
        </TabsContent>
      </Tabs>


      <Button variant="ghost" onClick={() => navigate({ to: "/president/evaluations" })}>
        Back to queue
      </Button>

      {(canFinalize || canReturn) && (
        <div className="flex flex-wrap gap-3 border-t border-border pt-4">
          {canFinalize ? <Button onClick={() => setAction("finalize")} disabled={actionMutation.isPending}>Finalize Evaluation</Button> : null}
          {canReturn ? <Button variant="outline" onClick={() => setAction("return")} disabled={actionMutation.isPending}>Return for Correction</Button> : null}
        </div>
      )}

      <div className="flex flex-wrap gap-2 print:hidden"><Button variant="outline" onClick={() => window.print()}>Print Evaluation</Button></div>

      <ReasonDialog
        open={action !== null}
        onOpenChange={(open) => !open && setAction(null)}
        title={action === "finalize" ? "Finalize evaluation?" : "Return evaluation for correction?"}
        description={action === "finalize" ? `This locks ${detail.full_name_snapshot}'s evaluation and records the final result.` : "Existing responses and ratings will be preserved for correction."}
        confirmLabel={action === "finalize" ? "Finalize Evaluation" : "Return for Correction"}
        destructive={action === "return"}
        pending={actionMutation.isPending}
        onConfirm={(reason) => action && actionMutation.mutate({ kind: action, reason })}
      />

      <AlertDialog open={confirm !== null} onOpenChange={(open) => !open && setConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Submit Step {confirm}?</AlertDialogTitle>
            <AlertDialogDescription>
              Once submitted, your answers can no longer be edited. Employee and supervisor ratings are not affected.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => confirm && mutation.mutate({ step: confirm, submit: true })}
            >
              Submit
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
    <PrintEvaluationSheet
      data={{
        employeeNumber: detail.employee_number_snapshot,
        fullName: detail.full_name_snapshot,
        jobTitle: detail.job_title_snapshot,
        division: detail.division_snapshot,
        section: detail.section_snapshot,
        cycleName: detail.cycle_name,
        cycleYear: detail.cycle_year,
        supervisorRemarks: detail.supervisor_remarks,
        criteria: detail.criteria,
        ratings: detail.ratings,
        finalScore: scoreQuery.data?.score?.finalScore ?? null,
        finalRatingLabel: scoreQuery.data?.score?.finalRatingLabel ?? null,
        step2: steps?.step2 ?? null,
        step3: steps?.step3 ?? null,
      }}
    />
    </>
  );
}

function StepPanel({
  step,
  locked,
  canEdit,
  answers,
  errors,
  pending,
  onChange,
  onSaveDraft,
  onSubmit,
  onAiSuggest,
  onAiDecision,
}: {
  step: PresidentStepData | null;
  locked: boolean;
  canEdit: boolean;
  answers: Record<string, string>;
  errors: string[];
  pending: boolean;
  onChange: (itemId: string, value: string) => void;
  onSaveDraft: () => void;
  onSubmit: () => void;
  onAiSuggest: (itemId: string, currentValue: string) => Promise<AiSuggestionResult>;
  onAiDecision: (itemId: string, decision: "ACCEPTED" | "DISMISSED", edited: boolean) => void;
}) {
  if (!step) {
    return (
      <EmptyState
        title="This step is not configured"
        description="Ask an administrator to activate the step template."
      />
    );
  }

  const readOnly = locked || !canEdit;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{step.title}</CardTitle>
        <CardDescription>{step.description}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <PresidentStepFields
          step={step}
          values={answers}
          onChange={onChange}
          readOnly={readOnly}
          errors={errors}
            onAiSuggest={onAiSuggest}
          onAiDecision={onAiDecision}
        />
        {locked ? (
          <p className="text-sm text-muted-foreground">
            Submitted {formatDateTime(step.submittedAt)} — this step is locked.
          </p>
        ) : !canEdit ? (
          <p className="text-sm text-muted-foreground">
            You do not have permission to complete this step.
          </p>
        ) : (
          <div className="flex flex-wrap gap-3">
            <Button variant="outline" onClick={onSaveDraft} disabled={pending}>
              {pending ? "Saving…" : "Save draft"}
            </Button>
            <Button onClick={onSubmit} disabled={pending}>
              Submit Step {step.step}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function itemsFor(
  steps: { step2: PresidentStepData | null; step3: PresidentStepData | null } | null,
  step: 2 | 3,
) {
  return (step === 2 ? steps?.step2?.items : steps?.step3?.items) ?? [];
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-0.5 font-medium text-foreground">{value || "—"}</p>
    </div>
  );
}
