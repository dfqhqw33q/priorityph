import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
  ReasonDialog,
  formatDateTime,
} from "@/components/ui-bits";
import { RadioRatingMatrix, ratingFor } from "@/components/rating-matrix";
import { useAccess } from "@/hooks/use-access";
import { getEvaluation, reopenSupervisorStage } from "@/lib/evaluations.functions";
import { saveRaterStep2 } from "@/lib/phase2.functions";
import { SignatureField } from "@/components/signature-field";

export const Route = createFileRoute("/_authenticated/supervisor/evaluations/$evaluationId")({
  head: () => ({
    meta: [
      { title: "Supervisor review | Priority Handling Logistics, Inc." },
      {
        name: "description",
        content: "Review an employee Step 1 assessment, rate all ten factors and submit to the President.",
      },
      { property: "og:title", content: "Supervisor review" },
      { property: "og:description", content: "Rate performance factors A–J and submit to the President." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: SupervisorReviewPage,
});

function SupervisorReviewPage() {
  const { evaluationId } = Route.useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { can } = useAccess();

  const fetchEvaluation = useServerFn(getEvaluation);
  const submitStep2 = useServerFn(saveRaterStep2);
  const reopen = useServerFn(reopenSupervisorStage);

  const [ratings, setRatings] = useState<Record<string, number | null>>({});
  const [remarks, setRemarks] = useState("");
  const [step2, setStep2] = useState({ strengths: "", weaknesses: "", development: "", advancement: "", careerTransfer: "", recommendations: "" });
  const [signature, setSignature] = useState<{ method: "DRAWN" | "UPLOAD"; data: string } | undefined>();
  const [errors, setErrors] = useState<string[]>([]);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [reopenOpen, setReopenOpen] = useState(false);
  const [dirty, setDirty] = useState(false);

  const query = useQuery({
    queryKey: ["evaluation", evaluationId],
    queryFn: () => fetchEvaluation({ data: { evaluationId } }),
    retry: false,
  });

  const detail = query.data ?? null;

  useEffect(() => {
    if (!detail) return;
    const next: Record<string, number | null> = {};
    for (const criterion of detail.criteria) {
      next[criterion.id] = ratingFor(detail.ratings, criterion.id, "SUPERVISOR");
    }
    setRatings(next);
    setRemarks(detail.supervisor_remarks);
    const source = detail as typeof detail & Record<string, string | null>;
    setStep2({ strengths: source["supervisor_step2_strengths"] ?? "", weaknesses: source["supervisor_step2_weaknesses"] ?? "", development: source["supervisor_step2_development"] ?? "", advancement: source["supervisor_step2_advancement"] ?? "", careerTransfer: source["supervisor_step2_career_transfer"] ?? "", recommendations: source["supervisor_step2_recommendations"] ?? "" });
    const savedSignature = source["rater_signature"] as { method: "DRAWN" | "UPLOAD"; signature_data: string | null } | null;
    if (savedSignature?.signature_data) setSignature({ method: savedSignature.method, data: savedSignature.signature_data });
    setDirty(false);
  }, [detail]);

  const employeeValues = useMemo(() => {
    const map: Record<string, number | null> = {};
    for (const criterion of detail?.criteria ?? []) {
      map[criterion.id] = ratingFor(detail?.ratings ?? [], criterion.id, "EMPLOYEE");
    }
    return map;
  }, [detail]);

  useEffect(() => {
    if (!dirty) return;
    const handler = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty]);

  const editable =
    detail?.status === "EMPLOYEE_SUBMITTED" || detail?.status === "SUPERVISOR_DRAFT";

  const ratingPayload = () =>
    Object.entries(ratings)
      .filter(([, value]) => typeof value === "number")
      .map(([criterionId, value]) => ({ criterionId, rating: value as number }));

  const draftMutation = useMutation({
    mutationFn: () => submitStep2({ data: { evaluationId, version: detail?.version ?? 1, ratings: ratingPayload(), remarks, ...step2, submit: false } }),
    onSuccess: async () => {
      toast.success("Draft saved");
      setDirty(false);
      await queryClient.invalidateQueries({ queryKey: ["evaluation", evaluationId] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const submitMutation = useMutation({
    mutationFn: async () => {
      return submitStep2({ data: { evaluationId, version: detail?.version ?? 1, ratings: ratingPayload(), remarks, ...step2, submit: true, signature } });
    },
    onSuccess: async () => {
      toast.success("Step 2 submitted for Reviewing Supervisor review");
      setDirty(false);
      await queryClient.invalidateQueries({ queryKey: ["evaluation", evaluationId] });
      await queryClient.invalidateQueries({ queryKey: ["supervisor-queue"] });
      navigate({ to: "/supervisor/evaluations" });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const reopenMutation = useMutation({
    mutationFn: (reason: string) => reopen({ data: { evaluationId, reason } }),
    onSuccess: async () => {
      toast.success("Returned to supervisor draft");
      setReopenOpen(false);
      await queryClient.invalidateQueries({ queryKey: ["evaluation", evaluationId] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  function handleSubmitClick() {
    const missing = (detail?.criteria ?? [])
      .filter((criterion) => typeof ratings[criterion.id] !== "number")
      .map((criterion) => criterion.id);
    setErrors(missing);
    if (missing.length > 0) {
      toast.error("Rate all ten factors before submitting");
      return;
    }
    if (!signature) {
      toast.error("Provide your electronic signature before submitting Step 2");
      return;
    }
    setConfirmOpen(true);
  }

  if (query.isLoading) return <LoadingBlock rows={6} />;
  if (query.isError) {
    const message = query.error instanceof Error ? query.error.message : "Unavailable";
    return <EmptyState title="Unable to open this evaluation" description={message} />;
  }
  if (!detail) return <EmptyState title="Evaluation not found" description="It may have been removed." />;

  return (
    <div className="space-y-6">
      <PageHeader
        title={detail.full_name_snapshot}
        description={`${detail.cycle_name} (${detail.cycle_year}) · Employee no. ${detail.employee_number_snapshot}`}
        actions={<EvaluationStatusBadge status={detail.status} />}
      />

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
          <Field label="Self-assessment submitted" value={formatDateTime(detail.employee_submitted_at)} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Performance factors</CardTitle>
          <CardDescription>
            The employee column is read-only. Rate each factor from 1 (poor) to 5 (excellent).
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <RadioRatingMatrix
            name="supervisor"
            criteria={detail.criteria}
            values={ratings}
            employeeValues={employeeValues}
            readOnly={!editable || !can("evaluations.rate_supervisor")}
            errorCriterionIds={errors}
            onChange={(criterionId, value) => {
              setRatings((prev) => ({ ...prev, [criterionId]: value }));
              setErrors((prev) => prev.filter((id) => id !== criterionId));
              setDirty(true);
            }}
          />

          <div className="space-y-1.5">
            <Label htmlFor="remarks">Supervisor remarks (optional)</Label>
            <Textarea
              id="remarks"
              rows={4}
              maxLength={2000}
              value={remarks}
              disabled={!editable || !can("evaluations.rate_supervisor")}
              onChange={(event) => {
                setRemarks(event.target.value);
                setDirty(true);
              }}
              placeholder="Context, observations or justification for the ratings"
            />
            <p className="text-xs text-muted-foreground">{remarks.length}/2000 characters</p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Step 2 — Conclusions and development</CardTitle>
          <CardDescription>Complete the Rater development fields before submission.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          {([
            ["strengths", "Strengths"], ["weaknesses", "Weaknesses"], ["development", "Development"],
            ["advancement", "Advancement"], ["careerTransfer", "Career / transfer"], ["recommendations", "Other recommendations"],
          ] as const).map(([key, label]) => (
            <div key={key} className="space-y-1.5">
              <Label htmlFor={`step2-${key}`}>{label}</Label>
              <Textarea id={`step2-${key}`} rows={3} value={step2[key]} disabled={!editable || !can("evaluations.step2")} onChange={(event) => { setStep2((current) => ({ ...current, [key]: event.target.value })); setDirty(true); }} />
            </div>
          ))}
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="rater-signature">Rater signature</Label>
            <SignatureField value={signature} disabled={!editable} onChange={(value) => { setSignature(value); setDirty(true); }} />
          </div>
        </CardContent>
      </Card>

      <div className="flex flex-wrap gap-3">
        {editable && can("evaluations.rate_supervisor") ? (
          <Button
            variant="outline"
            onClick={() => draftMutation.mutate()}
            disabled={draftMutation.isPending}
          >
            {draftMutation.isPending ? "Saving…" : "Save draft"}
          </Button>
        ) : null}
        {editable && can("evaluations.submit_president") && can("evaluations.step2") ? (
          <Button onClick={handleSubmitClick} disabled={submitMutation.isPending}>
            {submitMutation.isPending ? "Submitting…" : "Submit for Reviewing Supervisor"}
          </Button>
        ) : null}
        {detail.status === "SUPERVISOR_SUBMITTED" && can("evaluations.reopen_supervisor") ? (
          <Button variant="outline" onClick={() => setReopenOpen(true)}>
            Reopen supervisor stage
          </Button>
        ) : null}
        <Button variant="ghost" onClick={() => navigate({ to: "/supervisor/evaluations" })}>
          Back to queue
        </Button>
      </div>

      {!editable ? (
        <p className="text-sm text-muted-foreground">
          This assessment is locked because it has already been submitted to the President.
        </p>
      ) : null}

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Submit to the President?</AlertDialogTitle>
            <AlertDialogDescription>
              Your ratings and remarks will be locked and forwarded to the Reviewing Supervisor. This action is
              recorded in the audit trail.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => submitMutation.mutate()}>Submit</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <ReasonDialog
        open={reopenOpen}
        onOpenChange={setReopenOpen}
        title="Reopen supervisor stage"
        description="Explain why this submitted assessment must be edited again."
        confirmLabel="Reopen"
        pending={reopenMutation.isPending}
        onConfirm={(reason) => reopenMutation.mutate(reason)}
      />
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-0.5 font-medium text-foreground">{value || "—"}</p>
    </div>
  );
}
