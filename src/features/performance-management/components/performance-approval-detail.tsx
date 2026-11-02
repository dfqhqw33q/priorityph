import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useState } from "react";
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
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  EvaluationForm,
  type EvaluationFormValues,
} from "@/features/performance-management/components/evaluation-form";
import {
  decideDepartmentHeadEvaluation,
  decideHrEvaluation,
  getPerformanceApprovalDetail,
  reopenPerformanceEvaluation,
} from "@/lib/performance-approval.functions";
import type { EvaluationTemplate } from "@/lib/performance-management";
import { useAccess } from "@/hooks/use-access";
import {
  EmptyState,
  ErrorState,
  LoadingState,
  PageHeader,
  StatusBadge,
} from "@/components/shared/portal-ui";

type Props = {
  evaluationId: string;
  lane: "DEPARTMENT" | "HR" | "EMPLOYEE";
};

const checklistItems = [
  ["employee_record", "Correct employee record"],
  ["department", "Correct department"],
  ["supervisor", "Correct assigned supervisor"],
  ["department_head", "Correct Department Head"],
  ["evaluation_period", "Correct evaluation period"],
  ["profile_version", "Correct evaluation profile version"],
  ["required_ratings", "All required ratings completed"],
  ["required_evidence", "Required supporting evidence present"],
  ["department_head_approval", "Department Head approval recorded"],
  ["no_open_corrections", "No unresolved correction request"],
] as const;

type ChecklistState = Record<(typeof checklistItems)[number][0], boolean>;
type ReturnParty = "EMPLOYEE" | "SUPERVISOR" | "DEPARTMENT_HEAD";
type ReopenParty = "EMPLOYEE" | "SUPERVISOR";

export function PerformanceApprovalDetail({ evaluationId, lane }: Props) {
  const { can } = useAccess();
  const queryClient = useQueryClient();
  const loadDetail = useServerFn(getPerformanceApprovalDetail);
  const decideDepartment = useServerFn(decideDepartmentHeadEvaluation);
  const decideHr = useServerFn(decideHrEvaluation);
  const reopenEvaluation = useServerFn(reopenPerformanceEvaluation);
  const [dialogDecision, setDialogDecision] = useState<
    "APPROVE" | "RETURN" | "FINALIZE" | "REOPEN" | null
  >(null);
  const [reason, setReason] = useState("");
  const [responsibleParty, setResponsibleParty] = useState<ReturnParty>("SUPERVISOR");
  const [reopenParty, setReopenParty] = useState<ReopenParty>("SUPERVISOR");
  const [checklist, setChecklist] = useState<ChecklistState>({
    employee_record: false,
    department: false,
    supervisor: false,
    department_head: false,
    evaluation_period: false,
    profile_version: false,
    required_ratings: false,
    required_evidence: false,
    department_head_approval: false,
    no_open_corrections: false,
  });
  const query = useQuery({
    queryKey: ["performance-approval-detail", lane, evaluationId],
    queryFn: () => loadDetail({ data: { evaluationId, lane } }),
  });

  const decisionMutation = useMutation({
    mutationFn: async () => {
      if (lane === "DEPARTMENT") {
        if (dialogDecision !== "APPROVE" && dialogDecision !== "RETURN")
          throw new Error("Choose an approval decision.");
        return decideDepartment({
          data: {
            evaluationId,
            decision: dialogDecision,
            ...(dialogDecision === "RETURN" ? { reason } : {}),
          },
        });
      }
      if (dialogDecision === "REOPEN") {
        return reopenEvaluation({ data: { evaluationId, responsibleParty: reopenParty, reason } });
      }
      if (dialogDecision === "FINALIZE") {
        return decideHr({
          data: { evaluationId, decision: "FINALIZE", checklist },
        });
      }
      if (dialogDecision === "RETURN") {
        return decideHr({
          data: { evaluationId, decision: "RETURN", reason, responsibleParty },
        });
      }
      throw new Error("Choose an HR validation decision.");
    },
    onSuccess: async (result) => {
      toast.success(`Evaluation updated: ${result.status.replaceAll("_", " ")}.`);
      setDialogDecision(null);
      setReason("");
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: ["performance-approval-detail", lane, evaluationId],
        }),
        queryClient.invalidateQueries({ queryKey: ["performance-approval-queue"] }),
      ]);
    },
    onError: (error) => toast.error(error.message || "The decision could not be saved."),
  });

  useEffect(() => {
    if (lane !== "HR" || !query.data) return;
    const detail = query.data;
    const allEmployeeRatings = Object.values(detail.employeeRatings.ratings).every(
      (rating) => rating !== null,
    );
    const allSupervisorRatings = Object.values(detail.supervisorRatings.ratings).every(
      (rating) => rating !== null,
    );
    const allRequiredEvidencePresent = detail.categories
      .filter((category) => category.requiresEvidence)
      .every(
        (category) =>
          Boolean(detail.employeeRatings.evidence[category.id]?.trim()) &&
          Boolean(detail.supervisorRatings.evidence[category.id]?.trim()),
      );
    setChecklist({
      employee_record: Boolean(detail.employeeName && detail.employeeNumber),
      department: detail.department !== "Not specified",
      supervisor: detail.supervisorName !== "Unassigned",
      department_head: detail.departmentHeadName !== "Unassigned",
      evaluation_period: Boolean(detail.periodName),
      profile_version: detail.profileVersion > 0,
      required_ratings: allEmployeeRatings && allSupervisorRatings,
      required_evidence: allRequiredEvidencePresent,
      department_head_approval: Boolean(detail.departmentHeadApprovedAt),
      no_open_corrections: detail.status === "PENDING_HR_VALIDATION",
    });
  }, [lane, query.data]);

  const template = useMemo<EvaluationTemplate | null>(() => {
    if (!query.data) return null;
    return {
      id: evaluationId,
      name: query.data.profileName,
      jobPosition: query.data.position,
      version: query.data.profileVersion,
      effectiveDate: "",
      categories: query.data.categories.map((category) => ({
        id: category.id,
        name: category.name,
        weight: category.weight,
        indicators: [],
        evidence: category.requiresEvidence ? ["Required supporting evidence"] : [],
      })),
    };
  }, [evaluationId, query.data]);

  if (query.isPending) return <LoadingState label="Loading approval details" />;
  if (query.isError) return <ErrorState message={query.error.message} />;
  if (!query.data || !template)
    return (
      <EmptyState title="Evaluation not found" description="This evaluation is unavailable." />
    );

  const detail = query.data;
  const canApprove = lane === "DEPARTMENT" && can("performance.department_approval.approve");
  const canReturn =
    lane === "DEPARTMENT"
      ? can("performance.department_approval.return")
      : can("performance.hr_validation.return");
  const canFinalize = lane === "HR" && can("performance.hr_validation.finalize");
  const canReopen = lane === "HR" && can("performance.reopen");
  const departmentDecisionOpen =
    lane === "DEPARTMENT" &&
    (detail.status === "PENDING_DEPARTMENT_HEAD_APPROVAL" || detail.status === "RETURNED_BY_HR");
  const hrDecisionOpen = lane === "HR" && detail.status === "PENDING_HR_VALIDATION";
  const values = (assessment: EvaluationFormValues): EvaluationFormValues => assessment;

  return (
    <div className="space-y-6">
      <PageHeader
        breadcrumbs={[
          lane === "DEPARTMENT"
            ? "Department Performance"
            : lane === "HR"
              ? "Approval Center"
              : "My Performance",
          "Evaluation review",
        ]}
        title={`${detail.employeeName} · ${detail.reference}`}
        description="Review the submitted assessments and preserve the employee and Supervisor scores independently."
        actions={
          <a
            href={
              lane === "DEPARTMENT"
                ? "/department/pending"
                : lane === "HR"
                  ? "/hr/approvals"
                  : "/performance/history"
            }
            className="rounded-md border border-border px-3 py-2 text-sm font-medium hover:bg-muted"
          >
            Back to queue
          </a>
        }
      />

      <Card>
        <CardHeader>
          <CardTitle className="flex flex-wrap items-center justify-between gap-3">
            <span>Evaluation context</span>
            <StatusBadge>{detail.status.replaceAll("_", " ")}</StatusBadge>
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 text-sm sm:grid-cols-2 lg:grid-cols-4">
          <Info label="Employee ID" value={detail.employeeNumber} />
          <Info label="Employee" value={detail.employeeName} />
          <Info label="Department" value={detail.department} />
          <Info label="Job position" value={detail.position} />
          <Info label="Assigned Supervisor" value={detail.supervisorName} />
          <Info label="Department Head" value={detail.departmentHeadName} />
          <Info label="Evaluation period" value={detail.periodName} />
          <Info
            label="Evaluation profile"
            value={`${detail.profileName} · v${detail.profileVersion}`}
          />
          <Info label="Submitted" value={formatDate(detail.submittedAt)} />
          <Info
            label="Department Head approval"
            value={formatDate(detail.departmentHeadApprovedAt)}
          />
          <Info label="Finalized" value={formatDate(detail.finalizedAt)} />
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        <ScoreCard label="Employee weighted score" score={detail.employeeScore} />
        <ScoreCard label="Supervisor weighted score" score={detail.supervisorScore} />
      </div>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold">Employee self-assessment</h2>
        <p className="text-sm text-muted-foreground">
          Read-only employee ratings, comments, and evidence. Approval decisions do not change this
          assessment.
        </p>
        <EvaluationForm
          template={template}
          values={values(detail.employeeRatings)}
          disabled
          onRatingChange={() => undefined}
          onCommentChange={() => undefined}
          onEvidenceChange={() => undefined}
        />
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold">Supervisor assessment</h2>
        <p className="text-sm text-muted-foreground">
          Independently recorded Supervisor ratings, comments, and evidence.
        </p>
        <EvaluationForm
          template={template}
          values={values(detail.supervisorRatings)}
          disabled
          onRatingChange={() => undefined}
          onCommentChange={() => undefined}
          onEvidenceChange={() => undefined}
        />
        {detail.supervisorOverallComments ? (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Supervisor overall comments</CardTitle>
            </CardHeader>
            <CardContent className="whitespace-pre-wrap text-sm">
              {detail.supervisorOverallComments}
            </CardContent>
          </Card>
        ) : null}
        {lane === "HR" && detail.status === "FINALIZED" && canReopen ? (
          <div className="flex justify-end">
            <Button
              variant="outline"
              onClick={() => setDialogDecision("REOPEN")}
              disabled={decisionMutation.isPending}
            >
              Reopen for correction
            </Button>
          </div>
        ) : null}
      </section>

      {lane === "HR" ? (
        <Card>
          <CardHeader>
            <CardTitle>HR validation checklist</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2">
            {checklistItems.map(([key, label]) => (
              <label
                key={key}
                className="flex items-start gap-3 rounded-md border border-border p-3 text-sm"
              >
                <Checkbox
                  checked={checklist[key]}
                  onCheckedChange={(checked) =>
                    setChecklist((current) => ({ ...current, [key]: checked === true }))
                  }
                  disabled={decisionMutation.isPending || !hrDecisionOpen}
                />
                <span>{label}</span>
              </label>
            ))}
          </CardContent>
        </Card>
      ) : null}
      {dialogDecision === "REOPEN" ? (
        <label className="block space-y-1 text-sm">
          <span>Reopening reason (required)</span>
          <textarea
            className="min-h-24 w-full rounded-md border border-input bg-background p-3"
            maxLength={4000}
            value={reason}
            onChange={(event) => setReason(event.currentTarget.value)}
          />
        </label>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Approval history</CardTitle>
        </CardHeader>
        <CardContent>
          {detail.history.length ? (
            <ol className="space-y-3">
              {detail.history.map((event, index) => (
                <li
                  key={`${event.action}-${event.occurredAt}-${index}`}
                  className="border-l-2 border-primary/30 pl-4"
                >
                  <p className="font-medium">{event.action.replaceAll("_", " ")}</p>
                  <p className="text-sm text-muted-foreground">
                    {event.actorName} · {event.role.replaceAll("_", " ")} ·{" "}
                    {new Date(event.occurredAt).toLocaleString()}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {event.previousStatus.replaceAll("_", " ")} →{" "}
                    {event.newStatus.replaceAll("_", " ")}
                  </p>
                  {event.reason ? <p className="mt-1 text-sm">Reason: {event.reason}</p> : null}
                </li>
              ))}
            </ol>
          ) : (
            <p className="text-sm text-muted-foreground">
              No approval events have been recorded yet.
            </p>
          )}
        </CardContent>
      </Card>

      {detail.submissionHistory.length ? (
        <Card>
          <CardHeader>
            <CardTitle>Immutable assessment submissions</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {detail.submissionHistory.map((submission) => (
              <details
                key={`${submission.stage}-${submission.submissionNumber}`}
                className="rounded-md border border-border p-3"
              >
                <summary className="cursor-pointer text-sm font-medium">
                  {submission.stage} submission #{submission.submissionNumber} ·{" "}
                  {formatDate(submission.submittedAt)} · {submission.weightedScore.toFixed(2)} /
                  5.00 · {submission.submittedBy}
                </summary>
                <div className="mt-3 space-y-3">
                  {submission.ratings.map((rating) => (
                    <div key={rating.categoryId} className="rounded-md bg-muted/40 p-3 text-sm">
                      <p className="font-medium">
                        {rating.categoryName} · {rating.rating ?? "Not rated"}
                      </p>
                      {rating.comments ? (
                        <p className="mt-1 whitespace-pre-wrap">Comment: {rating.comments}</p>
                      ) : null}
                      {rating.evidence ? (
                        <p className="mt-1 whitespace-pre-wrap">Evidence: {rating.evidence}</p>
                      ) : null}
                    </div>
                  ))}
                </div>
              </details>
            ))}
          </CardContent>
        </Card>
      ) : null}

      {departmentDecisionOpen && (canApprove || canReturn) ? (
        <div className="flex flex-wrap justify-end gap-3">
          {canReturn ? (
            <Button
              variant="outline"
              onClick={() => setDialogDecision("RETURN")}
              disabled={decisionMutation.isPending}
            >
              Return to Supervisor
            </Button>
          ) : null}
          {canApprove ? (
            <Button
              onClick={() => setDialogDecision("APPROVE")}
              disabled={decisionMutation.isPending}
            >
              Approve evaluation
            </Button>
          ) : null}
        </div>
      ) : null}

      {hrDecisionOpen && (canReturn || canFinalize) ? (
        <div className="flex flex-wrap justify-end gap-3">
          {canReturn ? (
            <Button
              variant="outline"
              onClick={() => setDialogDecision("RETURN")}
              disabled={decisionMutation.isPending}
            >
              Return for correction
            </Button>
          ) : null}
          {canFinalize ? (
            <Button
              onClick={() => setDialogDecision("FINALIZE")}
              disabled={
                decisionMutation.isPending || Object.values(checklist).some((checked) => !checked)
              }
            >
              Finalize evaluation
            </Button>
          ) : null}
        </div>
      ) : null}

      <AlertDialog
        open={dialogDecision !== null}
        onOpenChange={(open) => {
          if (!open) {
            setDialogDecision(null);
            setReason("");
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{dialogTitle(dialogDecision)}</AlertDialogTitle>
            <AlertDialogDescription>{dialogDescription(dialogDecision)}</AlertDialogDescription>
          </AlertDialogHeader>
          {dialogDecision === "RETURN" || dialogDecision === "REOPEN" ? (
            <div className="space-y-3">
              {dialogDecision === "REOPEN" ? (
                <label className="block space-y-1 text-sm">
                  <span>Responsible reviewer</span>
                  <select
                    className="h-10 w-full rounded-md border border-input bg-background px-3"
                    value={reopenParty}
                    onChange={(event) => setReopenParty(event.currentTarget.value as ReopenParty)}
                  >
                    <option value="EMPLOYEE">Employee</option>
                    <option value="SUPERVISOR">Supervisor</option>
                  </select>
                </label>
              ) : null}
              {dialogDecision === "RETURN" && lane === "HR" ? (
                <label className="block space-y-1 text-sm">
                  <span>Responsible reviewer</span>
                  <select
                    className="h-10 w-full rounded-md border border-input bg-background px-3"
                    value={responsibleParty}
                    onChange={(event) =>
                      setResponsibleParty(event.currentTarget.value as ReturnParty)
                    }
                  >
                    <option value="EMPLOYEE">Employee</option>
                    <option value="SUPERVISOR">Supervisor</option>
                    <option value="DEPARTMENT_HEAD">Department Head</option>
                  </select>
                </label>
              ) : null}
              <label className="block space-y-1 text-sm">
                <span>Return reason (required)</span>
                <textarea
                  className="min-h-24 w-full rounded-md border border-input bg-background p-3"
                  maxLength={4000}
                  value={reason}
                  onChange={(event) => setReason(event.currentTarget.value)}
                />
              </label>
            </div>
          ) : null}
          {dialogDecision === "FINALIZE" ? (
            <p className="text-sm text-muted-foreground">
              The finalization will lock both assessment records and notify the employee,
              Supervisor, and Department Head.
            </p>
          ) : null}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={decisionMutation.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={
                decisionMutation.isPending ||
                ((dialogDecision === "RETURN" || dialogDecision === "REOPEN") && !reason.trim()) ||
                (dialogDecision === "FINALIZE" &&
                  Object.values(checklist).some((checked) => !checked))
              }
              onClick={(event) => {
                event.preventDefault();
                decisionMutation.mutate();
              }}
            >
              {decisionMutation.isPending
                ? "Saving..."
                : dialogDecision === "RETURN"
                  ? "Confirm return"
                  : dialogDecision === "REOPEN"
                    ? "Confirm reopening"
                    : "Confirm"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-1 font-medium">{value}</p>
    </div>
  );
}

function ScoreCard({ label, score }: { label: string; score: number | null }) {
  return (
    <Card>
      <CardContent className="p-5">
        <p className="text-sm text-muted-foreground">{label}</p>
        <p className="mt-1 text-2xl font-semibold">
          {score === null ? "Incomplete" : `${Number(score).toFixed(2)} / 5.00`}
        </p>
      </CardContent>
    </Card>
  );
}

function formatDate(value: string | null): string {
  return value ? new Date(value).toLocaleString() : "Not recorded";
}

function dialogTitle(decision: string | null): string {
  if (decision === "APPROVE") return "Approve this evaluation?";
  if (decision === "RETURN") return "Return this evaluation for correction?";
  if (decision === "FINALIZE") return "Finalize this evaluation?";
  if (decision === "REOPEN") return "Reopen this finalized evaluation?";
  return "Confirm decision";
}

function dialogDescription(decision: string | null): string {
  if (decision === "APPROVE")
    return "This advances the supervisor-submitted evaluation to HR validation. Ratings will remain unchanged.";
  if (decision === "RETURN")
    return "The selected reviewer will be notified, and the reason will be preserved in the approval history.";
  if (decision === "FINALIZE")
    return "Finalization locks the approved assessment records. This action cannot be undone through ordinary editing.";
  if (decision === "REOPEN")
    return "This controlled action preserves the finalization history, routes correction to the selected reviewer, and unlocks only that correction workflow.";
  return "Confirm the workflow decision.";
}
