import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import {
  EmptyState,
  ErrorState,
  LoadingState,
  PageHeader,
  StatusBadge,
} from "@/components/shared/portal-ui";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  EvaluationForm,
  type EvaluationFormValues,
} from "@/features/performance-management/components/evaluation-form";
import { getMyEvaluationFramework } from "@/lib/evaluation.functions";
import { calculateWeightedScore } from "@/lib/performance-management";
import { saveMyEvaluation } from "@/lib/performance-workflow.functions";

export const Route = createFileRoute("/_authenticated/performance/self-evaluation")({
  component: SelfEvaluationPage,
});

function SelfEvaluationPage() {
  const loadFramework = useServerFn(getMyEvaluationFramework);
  const saveEvaluation = useServerFn(saveMyEvaluation);
  const queryClient = useQueryClient();
  const [confirmSubmission, setConfirmSubmission] = useState(false);
  const query = useQuery({
    queryKey: ["my-evaluation-framework"],
    queryFn: () => loadFramework(),
  });
  const [values, setValues] = useState<EvaluationFormValues>({
    ratings: {},
    comments: {},
    evidence: {},
  });
  const saveMutation = useMutation({
    mutationFn: (action: "DRAFT" | "SUBMIT") =>
      saveEvaluation({
        data: {
          periodId: query.data?.period?.id ?? "",
          action,
          ratings: values.ratings,
          comments: values.comments,
          evidence: values.evidence,
        },
      }),
    onSuccess: async (result) => {
      toast.success(result.status === "SUBMITTED" ? "Self-evaluation submitted." : "Draft saved.");
      setConfirmSubmission(false);
      await queryClient.invalidateQueries({ queryKey: ["my-evaluation-framework"] });
    },
    onError: (error) => toast.error(error.message || "Could not save your evaluation."),
  });

  useEffect(() => {
    if (!query.data) return;
    setValues({
      ratings: query.data.evaluation?.ratings ?? {},
      comments: query.data.evaluation?.comments ?? {},
      evidence: query.data.evaluation?.evidence ?? {},
    });
  }, [query.data]);

  if (query.isPending) return <LoadingState label="Loading your evaluation framework" />;
  if (query.isError) return <ErrorState message={query.error.message} />;

  const { template, period, position, evaluation } = query.data;
  const readOnly = Boolean(
    evaluation && !["DRAFT", "IN_PROGRESS", "RETURNED_FOR_REVISION"].includes(evaluation.status),
  );
  const canEdit = Boolean(template && period && !readOnly);
  const score = template ? calculateWeightedScore(template, values.ratings) : null;
  return (
    <div className="space-y-6">
      <PageHeader
        breadcrumbs={["My Performance", "Self-Evaluation"]}
        title="Self-Evaluation"
        description="Review the job-specific categories, indicators, rating scale, and weighted scoring."
      />

      <Card>
        <CardHeader>
          <CardTitle className="flex flex-wrap items-center justify-between gap-3">
            <span>Evaluation information</span>
            <StatusBadge>{period ? "Evaluation period active" : "Framework preview"}</StatusBadge>
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 text-sm sm:grid-cols-2 lg:grid-cols-4">
          <EvaluationField label="Job position" value={position} />
          <EvaluationField label="Template" value={template?.name ?? "Not assigned"} />
          <EvaluationField label="Template version" value={template?.version.toString() ?? "—"} />
          <EvaluationField label="Evaluation period" value={period?.name ?? "No active period"} />
          {evaluation ? (
            <EvaluationField label="Status" value={evaluation.status.replaceAll("_", " ")} />
          ) : null}
          {evaluation?.submittedAt ? (
            <EvaluationField
              label="Submitted"
              value={new Date(evaluation.submittedAt).toLocaleString()}
            />
          ) : null}
          {period?.submissionDeadline ? (
            <EvaluationField label="Submission deadline" value={period.submissionDeadline} />
          ) : null}
        </CardContent>
      </Card>

      {!template ? (
        <EmptyState
          title="No active position template"
          description="There is no active evaluation template matching your assigned job position."
          detail="Ask the system owner to confirm your job-position assignment and activate its template."
        />
      ) : (
        <>
          {!period ? (
            <div className="rounded-lg border border-border bg-muted/40 px-4 py-3 text-sm text-muted-foreground">
              No active evaluation period is open. The form below is a framework preview; entries
              cannot be saved or submitted.
            </div>
          ) : null}
          {evaluation?.status === "RETURNED_FOR_REVISION" ? (
            <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm">
              Your supervisor returned this evaluation for revision. Update the self-assessment and
              submit it again.
            </div>
          ) : null}
          {readOnly ? (
            <div className="rounded-lg border border-border bg-muted/40 px-4 py-3 text-sm text-muted-foreground">
              This self-evaluation has been submitted and is locked for editing.
            </div>
          ) : null}
          <EvaluationForm
            template={template}
            values={values}
            disabled={!canEdit || saveMutation.isPending}
            onRatingChange={(categoryId, rating) =>
              setValues((current) => ({
                ...current,
                ratings: { ...current.ratings, [categoryId]: rating },
              }))
            }
            onCommentChange={(categoryId, comment) =>
              setValues((current) => ({
                ...current,
                comments: { ...current.comments, [categoryId]: comment },
              }))
            }
            onEvidenceChange={(categoryId, evidence) =>
              setValues((current) => ({
                ...current,
                evidence: { ...current.evidence, [categoryId]: evidence },
              }))
            }
          />
          {canEdit ? (
            <div className="flex flex-wrap justify-end gap-3">
              <Button
                type="button"
                variant="outline"
                disabled={saveMutation.isPending}
                onClick={() => saveMutation.mutate("DRAFT")}
              >
                {saveMutation.isPending ? "Saving..." : "Save draft"}
              </Button>
              <AlertDialog open={confirmSubmission} onOpenChange={setConfirmSubmission}>
                <AlertDialogTrigger asChild>
                  <Button type="button" disabled={saveMutation.isPending}>
                    Review and submit
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Submit your self-evaluation?</AlertDialogTitle>
                    <AlertDialogDescription>
                      After submission you cannot edit this evaluation unless your supervisor
                      returns it for revision.
                    </AlertDialogDescription>
                    <div className="max-h-64 space-y-2 overflow-y-auto rounded-md border p-3 text-sm">
                      {template?.categories.map((category) => (
                        <div key={category.id} className="flex items-start justify-between gap-4">
                          <span>{category.name}</span>
                          <span className="shrink-0 font-medium">
                            {values.ratings[category.id] ?? "Not rated"}
                          </span>
                        </div>
                      ))}
                      <div className="flex justify-between border-t pt-2 font-semibold">
                        <span>Self-evaluation weighted score</span>
                        <span>
                          {score?.score === null ? "Incomplete" : score?.score?.toFixed(2)}
                        </span>
                      </div>
                    </div>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Continue editing</AlertDialogCancel>
                    <AlertDialogAction
                      disabled={score?.score === null}
                      onClick={(event) => {
                        event.preventDefault();
                        saveMutation.mutate("SUBMIT");
                      }}
                    >
                      Confirm submission
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}

function EvaluationField({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-1 break-words font-medium text-foreground">{value}</p>
    </div>
  );
}
