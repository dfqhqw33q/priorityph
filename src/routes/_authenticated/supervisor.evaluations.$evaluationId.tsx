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
  formatDateTime,
} from "@/components/ui-bits";
import { EvaluationRatingCards, ratingFor } from "@/components/rating-matrix";
import { useAccess } from "@/hooks/use-access";
import { getEvaluation } from "@/lib/evaluations.functions";
import { saveRaterStep2 } from "@/lib/phase2.functions";
import { SignatureField } from "@/components/signature-field";
import { userErrorMessage } from "@/lib/validation";

export const Route = createFileRoute("/_authenticated/supervisor/evaluations/$evaluationId")({
  head: () => ({
    meta: [
      { title: "Supervisor review | Priority Handling Logistics, Inc." },
      {
        name: "description",
        content: "Review an employee Step 1 assessment, rate all ten factors and submit to the Reviewing Supervisor.",
      },
      { property: "og:title", content: "Supervisor review" },
      { property: "og:description", content: "Rate performance factors A–J and submit to the Reviewing Supervisor." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: SupervisorReviewPage,
});

type Step2State = Record<string, string>;
type Step2Props = { field: string; label: string; step2: Step2State; setStep2: React.Dispatch<React.SetStateAction<Step2State>>; editable: boolean; canEdit: boolean; setDirty: (dirty: boolean) => void };

function Step2Textarea({ field, label, step2, setStep2, editable, canEdit, setDirty }: Step2Props) {
  return <div className="space-y-1.5"><Label htmlFor={`step2-${field}`}>{label}</Label><Textarea id={`step2-${field}`} rows={3} value={step2[field] ?? ""} disabled={!editable || !canEdit} onChange={(event) => { setStep2((current) => ({ ...current, [field]: event.target.value })); setDirty(true); }} /></div>;
}

function Step2Input(props: Step2Props) {
  return <div className="space-y-1.5"><Label htmlFor={`step2-${props.field}`}>{props.label}</Label><input id={`step2-${props.field}`} className="h-10 w-full rounded-md border border-input bg-background px-3" value={props.step2[props.field] ?? ""} disabled={!props.editable || !props.canEdit} onChange={(event) => { props.setStep2((current) => ({ ...current, [props.field]: event.target.value })); props.setDirty(true); }} /></div>;
}

function Step2Choice({ field, label, options, ...props }: Step2Props & { options: string[] }) {
  return <fieldset className="space-y-2"><legend className="text-sm font-medium">{label}</legend>{options.map((option) => <label key={option} className="flex items-start gap-2 text-sm"><input type="radio" name={`step2-${field}`} value={option} checked={props.step2[field] === option} disabled={!props.editable || !props.canEdit} onChange={() => { props.setStep2((current) => ({ ...current, [field]: option })); props.setDirty(true); }} /><span>{option}</span></label>)}</fieldset>;
}

function SupervisorReviewPage() {
  const { evaluationId } = Route.useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { can } = useAccess();

  const fetchEvaluation = useServerFn(getEvaluation);
  const submitStep2 = useServerFn(saveRaterStep2);

  const [ratings, setRatings] = useState<Record<string, number | null>>({});
  const [remarks, setRemarks] = useState("");
  const [step2, setStep2] = useState<Step2State>({ overallExplanation: "", strengths: "", weaknesses: "", effectiveness: "", developmentPotential: "", advancementOutlook: "", growthSuggestions: "", transferInterest: "", transferJob: "", transferWhere: "", transferQualified: "", otherComments: "", date: "" });
  const [signature, setSignature] = useState<{ method: "DRAWN" | "UPLOAD"; data: string } | undefined>();
  const [errors, setErrors] = useState<string[]>([]);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [dirty, setDirty] = useState(false);

  const stepTwoMarkup = useMemo(() => {
    const escapeHtml = (value: string) =>
      value
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/\"/g, "&quot;")
        .replace(/'/g, "&#039;");

    const overallText = escapeHtml(
      step2.overallExplanation ||
        "The employee consistently met quality standards and deadlines. During the peak season,",
    );
    const strengthText = escapeHtml(
      step2.strengths || "Hardworking, dependable, willing to learn, good teamwork, and strong initiative.",
    );
    const weaknessText = escapeHtml(
      step2.weaknesses || "Can improve in documentation and attention to detail.",
    );
    const effectivenessText = escapeHtml(
      step2.effectiveness || "Enhance documentation accuracy and continue improving process knowledge.",
    );
    const growthText = escapeHtml(
      step2.growthSuggestions ||
        "Provide cross-training in inventory system and warehouse operations, enroll in basic warehouse management training, and assign as assistant lead in selected tasks to develop leadership skills.",
    );
    const otherCommentsText = escapeHtml(
      step2.otherComments || "Continue to develop leadership qualities and process improvement mindset. Keep up the good work.",
    );

    const developmentChecked = (value: string) => (step2.developmentPotential === value ? "checked" : "");
    const advancementChecked = (value: string) => (step2.advancementOutlook === value ? "checked" : "");
    const transferValue = step2.transferInterest || "NO";
    const transferYesChecked = transferValue === "YES" ? "checked" : "";
    const transferNoChecked = transferValue === "NO" ? "checked" : "";
    const transferUnknownChecked = transferValue === "NOT_AWARE" ? "checked" : "";

    return `
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="utf-8"/>
        <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
        <title>Conclusions and Comments Form</title>
        <script src="https://cdn.tailwindcss.com?plugins=forms,container-queries"></script>
        <link href="https://fonts.googleapis.com" rel="preconnect"/>
        <link crossorigin="" href="https://fonts.gstatic.com" rel="preconnect"/>
        <link href="https://fonts.googleapis.com/css2?family=Caveat:wght@500&family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet"/>
        <style>
          body { font-family: 'Inter', sans-serif; }
          .handwriting { font-family: 'Caveat', cursive; font-size: 1.25rem; color: #1f2937; }
          .input-line { border-bottom: 1px solid #9ca3af; padding-bottom: 0.125rem; }
        </style>
      </head>
      <body class="bg-gray-100 p-4 md:p-8 flex justify-center">
        <main class="bg-white w-full max-w-4xl p-6 md:p-12 shadow-lg rounded-sm text-sm text-gray-900 leading-relaxed">
          <header class="text-center mb-8">
            <h1 class="text-xl font-bold uppercase mb-1">Conclusions and Comments</h1>
            <h2 class="text-lg font-bold uppercase">(Confidential: Not to be shown to ratee)</h2>
          </header>
          <div class="mb-4">
            <span class="font-bold">STEP TWO:</span> Develop conclusion and comments
          </div>
          <div class="space-y-6">
            <section class="flex gap-4">
              <div class="font-bold">1.</div>
              <div class="flex-1">
                <p class="mb-2">If the overall rating is excellent or poor, explain why the employee was rated such or support rating with specific incidents.</p>
                <div class="space-y-6 mt-4">
                  <div class="input-line"><span class="handwriting px-2">${overallText}</span></div>
                  <div class="input-line"><span class="handwriting px-2">he demonstrated strong initiative by optimizing the warehouse layout which improved</span></div>
                  <div class="input-line"><span class="handwriting px-2">picking efficiency and reduced errors. He also volunteered to assist new staff which</span></div>
                  <div class="input-line"><span class="handwriting px-2">greatly helped the team.</span></div>
                  <div class="input-line"></div>
                </div>
              </div>
            </section>
            <section class="flex gap-4">
              <div class="font-bold">2.</div>
              <div class="flex-1">
                <p class="mb-4">Summarize the principal strengths and weakness of the employee.</p>
                <div class="mb-4">
                  <p class="font-bold mb-2">Principal Strengths:</p>
                  <div class="input-line"><span class="handwriting px-2">${strengthText}</span></div>
                  <div class="input-line mt-6"></div>
                </div>
                <div class="mb-4">
                  <p class="font-bold mb-2">Principal Weakness:</p>
                  <div class="input-line"><span class="handwriting px-2">${weaknessText}</span></div>
                  <div class="input-line mt-6"></div>
                </div>
                <div>
                  <p class="mb-2">To be more effective on present job the employee should:</p>
                  <div class="input-line"><span class="handwriting px-2">${effectivenessText}</span></div>
                  <div class="input-line mt-6"></div>
                </div>
              </div>
            </section>
            <div class="grid grid-cols-1 md:grid-cols-2 gap-8">
              <section class="flex gap-4">
                <div class="font-bold">3.</div>
                <div class="flex-1">
                  <p class="mb-3">The employee's development potential on present job is:</p>
                  <div class="space-y-2">
                    <label class="flex items-start gap-3 cursor-pointer"><input class="mt-1" disabled name="potential" type="radio" ${developmentChecked("Very marked growth expected on present job")}/><span>Very marked growth expected on present job</span></label>
                    <label class="flex items-start gap-3 cursor-pointer"><input class="mt-1" name="potential" readonly type="radio" ${developmentChecked("Considerable improvement expected on present job")}/><span>Considerable improvement expected on present job</span></label>
                    <label class="flex items-start gap-3 cursor-pointer"><input class="mt-1" disabled name="potential" type="radio" ${developmentChecked("Only moderate improvement ahead on present job")}/><span>Only moderate improvement ahead on present job</span></label>
                    <label class="flex items-start gap-3 cursor-pointer"><input class="mt-1" disabled name="potential" type="radio" ${developmentChecked("Likely to maintain present performance level on present job")}/><span>Likely to maintain present performance level<br/>on present job</span></label>
                    <label class="flex items-start gap-3 cursor-pointer"><input class="mt-1" disabled name="potential" type="radio" ${developmentChecked("Likely to become less effective on present job")}/><span>Likely to become less effective on present job</span></label>
                  </div>
                </div>
              </section>
              <section class="flex gap-4">
                <div class="font-bold">4.</div>
                <div class="flex-1">
                  <p class="mb-3">The employee's advancement outlook is:</p>
                  <div class="space-y-2">
                    <label class="flex items-start gap-3 cursor-pointer"><input class="mt-1" disabled name="advancement" type="radio" ${advancementChecked("Promising. Should be able to advance to jobs several levels beyond his present one.")}/><span>Promising. Should be able to advance to jobs<br/>several levels beyond his present one.</span></label>
                    <label class="flex items-start gap-3 cursor-pointer"><input class="mt-1" name="advancement" readonly type="radio" ${advancementChecked("Fairly Promising. Should be able to advance to job in the next higher level.")}/><span>Fairly Promising. Should be able to advance to job<br/>in the next higher level.</span></label>
                    <label class="flex items-start gap-3 cursor-pointer"><input class="mt-1" disabled name="advancement" type="radio" ${advancementChecked("Present job or jobs within the same grade level represent his advancement.")}/><span>Present job or jobs within the same grade level<br/>represent his advancement.</span></label>
                    <label class="flex items-start gap-3 cursor-pointer"><input class="mt-1" disabled name="advancement" type="radio" ${advancementChecked("Employee has difficulty in advancing to his job ceiling")}/><span>Employee has difficulty in advancing to his job ceiling</span></label>
                    <label class="flex items-start gap-3 cursor-pointer"><input class="mt-1" disabled name="advancement" type="radio" ${advancementChecked("Employee should be transferred. Not suited to this job; would fit better in some other jobs.")}/><span>Employee should be transferred. Not suited to this<br/>job; would fit better in some other jobs.</span></label>
                  </div>
                </div>
              </section>
            </div>
            <section class="flex gap-4">
              <div class="font-bold">5.</div>
              <div class="flex-1">
                <p class="mb-2">Suggest ways to accelerate employee's growth and development.</p>
                <div class="space-y-6 mt-4">
                  <div class="input-line"><span class="handwriting px-2">${growthText}</span></div>
                  <div class="input-line"></div>
                </div>
              </div>
            </section>
            <section class="flex gap-4">
              <div class="font-bold">6.</div>
              <div class="flex-1">
                <p class="mb-3">Has the employed expressed any interest in assuming another job or transferring to another company / division / department / section?</p>
                <div class="flex gap-6 mb-4">
                  <label class="flex items-center gap-2 cursor-pointer"><input disabled name="transfer" type="radio" ${transferYesChecked}/><span>YES</span></label>
                  <label class="flex items-center gap-2 cursor-pointer"><input name="transfer" readonly type="radio" ${transferNoChecked}/><span>NO</span></label>
                  <label class="flex items-center gap-2 cursor-pointer"><input disabled name="transfer" type="radio" ${transferUnknownChecked}/><span>NOT AWARE</span></label>
                </div>
                <div class="space-y-3 max-w-lg">
                  <div class="flex items-end gap-2"><span class="w-24">If yes, what job?</span><div class="flex-1 border-b border-gray-400"></div></div>
                  <div class="flex items-end gap-2"><span class="w-24">Where?</span><div class="flex-1 border-b border-gray-400"></div></div>
                  <div class="flex items-end gap-2"><span class="w-24">Is he qualified?</span><div class="flex-1 border-b border-gray-400"></div></div>
                </div>
              </div>
            </section>
            <section class="flex gap-4">
              <div class="font-bold">7.</div>
              <div class="flex-1">
                <p class="mb-2">Other comments and recommendations</p>
                <div class="space-y-6 mt-4">
                  <div class="input-line"><span class="handwriting px-2">${otherCommentsText}</span></div>
                  <div class="input-line"></div>
                </div>
              </div>
            </section>
          </div>
          <footer class="mt-16 flex justify-end">
            <div class="flex gap-8 items-end">
              <div class="text-center w-64">
                <div class="border-b border-gray-600 pb-1 relative h-12">
                  <span class="handwriting text-3xl absolute bottom-0 left-1/2 -translate-x-1/2 whitespace-nowrap">${escapeHtml(step2.date || "Juan dela")}</span>
                </div>
                <div class="font-bold mt-1 uppercase">${escapeHtml(raterName || "Juan Dela Cruz")}</div>
                <div class="text-sm">Signature of Rater</div>
              </div>
              <div class="text-center w-32">
                <div class="border-b border-gray-600 pb-1 h-12 flex items-end justify-center">
                  <span>${escapeHtml(step2.date || "May 15, 2026")}</span>
                </div>
                <div class="mt-1 text-sm">Date</div>
              </div>
            </div>
          </footer>
        </main>
      </body>
      </html>
    `;
  }, [raterName, step2]);

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
    setStep2({ overallExplanation: source["supervisor_step2_overall_explanation"] ?? "", strengths: source["supervisor_step2_strengths"] ?? "", weaknesses: source["supervisor_step2_weaknesses"] ?? "", effectiveness: source["supervisor_step2_effectiveness"] ?? "", developmentPotential: source["supervisor_step2_development_potential"] ?? "", advancementOutlook: source["supervisor_step2_advancement_outlook"] ?? "", growthSuggestions: source["supervisor_step2_growth_suggestions"] ?? "", transferInterest: source["supervisor_step2_transfer_interest"] ?? "", transferJob: source["supervisor_step2_transfer_job"] ?? "", transferWhere: source["supervisor_step2_transfer_where"] ?? "", transferQualified: source["supervisor_step2_transfer_qualified"] ?? "", otherComments: source["supervisor_step2_other_comments"] ?? "", date: source["supervisor_step2_date"] ?? "" });
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
    onError: (error: Error) => toast.error(userErrorMessage(error, "Draft could not be saved")),
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
    onError: (error: Error) => toast.error(userErrorMessage(error, "Step 2 submission failed")),
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
          <EvaluationRatingCards
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
          <CardTitle className="text-base">CONCLUSIONS AND COMMENTS</CardTitle>
          <CardDescription>(CONFIDENTIAL: NOT TO BE SHOWN TO RATEE)</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div
            className="overflow-hidden rounded-sm border border-slate-200 bg-white"
            dangerouslySetInnerHTML={{ __html: stepTwoMarkup }}
          />

          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="rater-signature">Signature of Rater</Label>
            <SignatureField {...(signature ? { value: signature } : {})} disabled={!editable} onChange={(value) => { setSignature(value); setDirty(true); }} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="step2-date">Date</Label>
            <input id="step2-date" type="date" className="h-10 rounded-md border border-input bg-background px-3" value={step2["date"]} disabled={!editable || !can("evaluations.step2")} onChange={(event) => { setStep2((current) => ({ ...current, date: event.target.value })); setDirty(true); }} />
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
        {editable && can("evaluations.step2") ? (
          <Button onClick={handleSubmitClick} disabled={submitMutation.isPending}>
            {submitMutation.isPending ? "Submitting…" : "Submit for Reviewing Supervisor"}
          </Button>
        ) : null}
        <Button variant="ghost" onClick={() => navigate({ to: "/supervisor/evaluations" })}>
          Back to queue
        </Button>
      </div>

      {!editable ? (
          <p className="text-sm text-muted-foreground">
          This assessment is locked because it has already been submitted to the Reviewing Supervisor.
        </p>
      ) : null}

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Submit to the Reviewing Supervisor?</AlertDialogTitle>
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
