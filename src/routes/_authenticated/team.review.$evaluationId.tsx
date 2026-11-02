import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { toast } from "sonner";

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
  EmptyState,
  ErrorState,
  LoadingState,
  PageHeader,
  StatusBadge,
} from "@/components/shared/portal-ui";
import {
  EvaluationForm,
  type EvaluationFormValues,
} from "@/features/performance-management/components/evaluation-form";
import {
  getSupervisorEvaluationDetail,
  saveSupervisorEvaluation,
} from "@/lib/supervisor-evaluation.functions";
import { calculateWeightedScore } from "@/lib/performance-management";

export const Route = createFileRoute("/_authenticated/team/review/$evaluationId")({
  component: SupervisorEvaluationReviewPage,
});

function SupervisorEvaluationReviewPage() {
  const { evaluationId } = Route.useParams();
  const loadEvaluation = useServerFn(getSupervisorEvaluationDetail);
  const saveEvaluation = useServerFn(saveSupervisorEvaluation);
  const queryClient = useQueryClient();
  const [values, setValues] = useState<EvaluationFormValues>({
    ratings: {},
    comments: {},
    evidence: {},
  });
  const [confirmSubmission, setConfirmSubmission] = useState(false);
  const query = useQuery({
    queryKey: ["supervisor-evaluation-detail", evaluationId],
    queryFn: () => loadEvaluation({ data: { evaluationId } }),
  });
  const saveMutation = useMutation({
    mutationFn: (action: "DRAFT" | "SUBMIT") =>
      saveEvaluation({
        data: {
          evaluationId,
          action,
          ratings: values.ratings,
          comments: values.comments,
          evidence: values.evidence,
        },
      }),
    onSuccess: async (result) => {
      toast.success(
        result.status === "SUPERVISOR_SUBMITTED"
          ? "Supervisor evaluation submitted."
          : "Supervisor evaluation draft saved.",
      );
      setConfirmSubmission(false);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["supervisor-evaluation-detail", evaluationId] }),
        queryClient.invalidateQueries({ queryKey: ["supervisor-evaluations"] }),
        queryClient.invalidateQueries({ queryKey: ["supervisor-dashboard"] }),
      ]);
    },
    onError: (error) => toast.error(error.message || "Could not save your evaluation."),
  });

  useEffect(() => {
    if (!query.data) return;
    setValues({
      ratings: query.data.supervisorEvaluation?.ratings ?? {},
      comments: query.data.supervisorEvaluation?.comments ?? {},
      evidence: query.data.supervisorEvaluation?.evidence ?? {},
    });
  }, [query.data]);

  if (query.isPending) return <LoadingState label="Loading employee evaluation" />;
  if (query.isError) return <ErrorState message={query.error.message} />;
  if (!query.data) {
    return (
      <EmptyState
        title="Evaluation not found"
        description="This evaluation may have been removed or is no longer assigned to you."
      />
    );
  }

  const detail = query.data;
  const locked = Boolean(
    detail.evaluation.status === "COMPLETED" ||
    (detail.supervisorEvaluation &&
      ["SUBMITTED", "COMPLETED"].includes(detail.supervisorEvaluation.status)),
  );
  const score = calculateWeightedScore(detail.template, values.ratings);

  return (
    <div className="space-y-6">
      <PageHeader
        breadcrumbs={["Performance Management", "Employee Evaluations", "Review"]}
        title={`Evaluation: ${detail.employee.fullName}`}
        description="Review the employee's submitted self-assessment and record your independent ratings."
        actions={
          <Button asChild variant="outline">
            <Link to="/team/evaluations">Back to employee evaluations</Link>
          </Button>
        }
      />

      <Card>
        <CardHeader>
          <CardTitle className="flex flex-wrap items-center justify-between gap-3">
            <span>Evaluation information</span>
            <StatusBadge>{detail.evaluation.status.replaceAll("_", " ")}</StatusBadge>
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 text-sm sm:grid-cols-2 lg:grid-cols-4">
          <InfoField label="Employee ID" value={detail.employee.employeeNumber} />
          <InfoField label="Employee" value={detail.employee.fullName} />
          <InfoField label="Position" value={detail.employee.position} />
          <InfoField label="Department" value={detail.employee.department} />
          <InfoField label="Evaluation period" value={detail.periodName} />
          <InfoField
            label="Employee submitted"
            value={
              detail.evaluation.submittedAt
                ? new Date(detail.evaluation.submittedAt).toLocaleString()
                : "Not recorded"
            }
          />
          <InfoField
            label="Employee weighted score"
            value={
              detail.evaluation.weightedScore === null
                ? "Incomplete"
                : `${Number(detail.evaluation.weightedScore).toFixed(2)} / 5.00`
            }
          />
          <InfoField
            label="Supervisor evaluation"
            value={detail.supervisorEvaluation?.status.replaceAll("_", " ") ?? "Not started"}
          />
        </CardContent>
      </Card>

      <section className="space-y-4">
        <div>
          <h2 className="text-xl font-semibold">Your independent Supervisor evaluation</h2>
          <p className="text-sm text-muted-foreground">
            Compare the employee's self-assessment as you rate each category. Matching the
            employee's rating is allowed, but your assessment is stored separately.
          </p>
        </div>
        {locked ? (
          <div className="rounded-lg border border-border bg-muted/40 px-4 py-3 text-sm text-muted-foreground">
            Your Supervisor evaluation has been submitted and is locked.
          </div>
        ) : null}
        <EvaluationForm
          template={detail.template}
          values={values}
          comparisonValues={detail.employeeRatings}
          disabled={locked || saveMutation.isPending}
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
        {!locked ? (
          <div className="flex flex-wrap justify-end gap-3">
            <Button
              variant="outline"
              disabled={saveMutation.isPending}
              onClick={() => saveMutation.mutate("DRAFT")}
            >
              {saveMutation.isPending ? "Saving..." : "Save draft"}
            </Button>
            <AlertDialog open={confirmSubmission} onOpenChange={setConfirmSubmission}>
              <AlertDialogTrigger asChild>
                <Button disabled={saveMutation.isPending}>Review and submit</Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Submit your Supervisor evaluation?</AlertDialogTitle>
                  <AlertDialogDescription>
                    Your ratings will be stored independently from the employee self-evaluation.
                    Submission locks your ratings.
                  </AlertDialogDescription>
                  <div className="max-h-64 space-y-2 overflow-y-auto rounded-md border p-3 text-sm">
                    {detail.template.categories.map((category) => (
                      <div key={category.id} className="flex justify-between gap-4">
                        <span>{category.name}</span>
                        <span className="font-medium">
                          {values.ratings[category.id] ?? "Not rated"}
                        </span>
                      </div>
                    ))}
                    <div className="flex justify-between border-t pt-2 font-semibold">
                      <span>Supervisor weighted score</span>
                      <span>{score.score === null ? "Incomplete" : score.score.toFixed(2)}</span>
                    </div>
                  </div>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Continue editing</AlertDialogCancel>
                  <AlertDialogAction
                    disabled={score.score === null}
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
      </section>
    </div>
  );
}

function InfoField({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-1 break-words font-medium text-foreground">{value}</p>
    </div>
  );
}
