import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
type Phase2Values = {
  [key: string]: string | undefined;
  strengths?: string;
  weaknesses?: string;
  development?: string;
  advancement?: string;
  careerTransfer?: string;
  recommendations?: string;
  date?: string;
  comments?: string;
  presentSalary?: string;
  lastIncreaseDate?: string;
  lastIncreaseNature?: string;
  lastIncreaseAmount?: string;
  totalPoints?: string;
  adjectiveRating?: string;
  recommendedIncreaseBonus?: string;
  actionDetails?: string;
  approve?: string;
};
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { EvaluationRatingCards, ratingFor } from "@/components/rating-matrix";
import { SignatureField, type SignatureValue } from "@/components/signature-field";
import { EmptyState, EvaluationStatusBadge, LoadingBlock, PageHeader } from "@/components/ui-bits";
import {
  getPhase2Evaluation,
  approveEvaluation,
  saveRaterStep2,
  submitCommitteeReview,
  submitPersonnelProcessing,
  submitReviewingSupervisor,
} from "@/lib/phase2.functions";
import { getEvaluationDocumentUrl } from "@/lib/documents.functions";
import { userErrorMessage } from "@/lib/validation";

type Stage = "RATER" | "REVIEWING_SUPERVISOR" | "PERSONNEL" | "COMMITTEE" | "PRESIDENT";

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-0.5 font-medium text-foreground">{value || "—"}</p>
    </div>
  );
}

export function Phase2StageDetail({ stage, evaluationId }: { stage: Stage; evaluationId: string }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const fetch = useServerFn(getPhase2Evaluation);
  const getDocumentUrl = useServerFn(getEvaluationDocumentUrl);
  const query = useQuery({
    queryKey: ["phase2-evaluation", evaluationId],
    queryFn: () => fetch({ data: { evaluationId, stage } }),
    retry: false,
  });
  const detail = query.data;
  const [values, setValues] = useState<Phase2Values>({});
  const [ratings, setRatings] = useState<Record<string, number | null>>({});
  const [signature, setSignature] = useState<SignatureValue | undefined>();
  const [action, setAction] = useState("RETAIN");
  const [reason, setReason] = useState("");
  const [correctionStage, setCorrectionStage] = useState("SUPERVISOR_DRAFT");
  const workflowDate = () => new Date().toISOString().slice(0, 10);
  const editableStatuses = {
    RATER: ["EMPLOYEE_SUBMITTED", "SUPERVISOR_DRAFT"],
    REVIEWING_SUPERVISOR: ["SUPERVISOR_SUBMITTED", "REVIEWING_SUPERVISOR_REVIEW"],
    PERSONNEL: ["PERSONNEL_PROCESSING"],
    COMMITTEE: ["COMMITTEE_REVIEW"],
    PRESIDENT: ["PRESIDENT_APPROVAL"],
  }[stage];
  const targetStatus =
    stage === "RATER"
      ? "SUPERVISOR_DRAFT"
      : stage === "REVIEWING_SUPERVISOR"
        ? "REVIEWING_SUPERVISOR_REVIEW"
        : stage === "PERSONNEL"
          ? "PERSONNEL_PROCESSING"
          : stage === "COMMITTEE"
            ? "COMMITTEE_REVIEW"
            : "PRESIDENT_APPROVAL";
  const correctionTarget = (detail as (typeof detail & { correction_stage?: string }) | undefined)
    ?.correction_stage;
  const editable =
    editableStatuses.includes(detail?.status ?? "") ||
    (detail?.status === "RETURNED_FOR_CORRECTION" && correctionTarget === targetStatus);
  useEffect(() => {
    if (!detail) return;
    const record = (detail as typeof detail & { stageRecord?: Record<string, unknown> })
      .stageRecord;
    const source = detail as typeof detail & Record<string, unknown>;
    const savedStageSignature = source["stageSignature"] as { method: "DRAWN" | "UPLOAD"; signature_data: string | null } | null;
    if (savedStageSignature?.signature_data && (savedStageSignature.method === "DRAWN" || savedStageSignature.method === "UPLOAD"))
      setSignature({ method: savedStageSignature.method, data: savedStageSignature.signature_data });
    if (stage === "RATER")
      setValues({
        strengths: String(source["supervisor_step2_strengths"] ?? ""),
        weaknesses: String(source["supervisor_step2_weaknesses"] ?? ""),
        development: String(source["supervisor_step2_development"] ?? ""),
        advancement: String(source["supervisor_step2_advancement"] ?? ""),
        careerTransfer: String(source["supervisor_step2_career_transfer"] ?? ""),
        recommendations: String(source["supervisor_step2_recommendations"] ?? ""),
      });
    if (stage === "REVIEWING_SUPERVISOR" && record) {
      const nextDate = String(record["reviewing_supervisor_date"] ?? workflowDate());
      setValues({
        comments: String(record["comments"] ?? ""),
        recommendations: String(record["recommendations"] ?? ""),
        date: nextDate,
      });
      const nextRatings: Record<string, number | null> = {};
      for (const criterion of detail.criteria)
        nextRatings[criterion.id] = ratingFor(detail.ratings, criterion.id, "REVIEWING_SUPERVISOR");
      setRatings(nextRatings);
    }
    if (stage === "PERSONNEL" && record)
      setValues({
        presentSalary: String(record["present_salary"] ?? ""),
        lastIncreaseDate: String(record["last_increase_date"] ?? ""),
        lastIncreaseNature: String(record["last_increase_nature"] ?? ""),
        lastIncreaseAmount: String(record["last_increase_amount"] ?? ""),
        totalPoints: String(record["total_points"] ?? ""),
        adjectiveRating: String(record["adjective_rating"] ?? ""),
        recommendedIncreaseBonus: String(record["recommended_increase_bonus"] ?? ""),
      });
    if (stage === "COMMITTEE" && record) {
      setAction(String(record["final_action"] ?? "RETAIN"));
      setValues({
        actionDetails: String(record["action_details"] ?? ""),
        recommendations: String(record["recommendation"] ?? ""),
      });
    }
    if (stage === "PRESIDENT")
      setValues({
        approve: "true",
      });
  }, [detail, stage]);
  const update = (key: string, value: string) =>
    setValues((current) => ({ ...current, [key]: value }));
  async function openDocument(mode: "preview" | "print", forceRefresh = true) {
    try {
      const result = await getDocumentUrl({ data: { evaluationId, forceRefresh } });
      const win = window.open(result.url, "_blank", "noopener,noreferrer");
      if (mode === "print") {
        setTimeout(() => win?.print(), 600);
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "The evaluation document is not available yet.");
    }
  }

  const mutation = useMutation({
    mutationFn: async (submit: boolean) => {
      if (!detail) throw new Error("Evaluation unavailable");
      const base = {
        evaluationId,
        version: detail.version,
        submit,
        signature,
      };
      if (stage === "RATER")
        return saveRaterStep2({
          data: {
            ...base,
            strengths: values.strengths ?? "",
            weaknesses: values.weaknesses ?? "",
            development: values.development ?? "",
            advancement: values.advancement ?? "",
            careerTransfer: values.careerTransfer ?? "",
            recommendations: values.recommendations ?? "",
            date: submit ? values.date || workflowDate() : values.date || "",
          },
        });
      if (stage === "REVIEWING_SUPERVISOR")
        return submitReviewingSupervisor({
          data: {
            ...base,
            ratings: Object.entries(ratings).filter(([, rating]) => rating !== null).map(([criterionId, rating]) => ({ criterionId, rating: rating! })),
            comments: values.comments ?? "",
            recommendations: values.recommendations ?? "",
            date: submit ? values.date || workflowDate() : values.date || "",
          },
        });
      if (stage === "PERSONNEL")
        return submitPersonnelProcessing({
          data: {
            ...base,
            presentSalary: values.presentSalary ? Number(values.presentSalary) : null,
            lastIncreaseDate: values.lastIncreaseDate || null,
            lastIncreaseNature: values.lastIncreaseNature ?? "",
            lastIncreaseAmount: values.lastIncreaseAmount
              ? Number(values.lastIncreaseAmount)
              : null,
            totalPoints: values.totalPoints ? Number(values.totalPoints) : null,
            adjectiveRating: values.adjectiveRating ?? "",
            recommendedIncreaseBonus: values.recommendedIncreaseBonus ?? "",
          },
        });
      if (stage === "COMMITTEE")
        return submitCommitteeReview({
          data: {
            ...base,
            finalAction: action as never,
            actionDetails: values.actionDetails ?? "",
            recommendation: values.recommendations ?? "",
          },
        });
      return approveEvaluation({
        data: {
          evaluationId,
          version: detail.version,
          approve: values.approve === "true",
          reason,
          correctionStage: correctionStage as never,
          signature: signature ? { method: "TYPED", data: signature.data } : undefined,
        },
      });
    },
    onSuccess: async () => {
      const message =
        stage === "RATER"
          ? "Evaluation submitted for Reviewing Supervisor review."
          : stage === "REVIEWING_SUPERVISOR"
            ? "Evaluation submitted for Personnel Office review."
            : stage === "PERSONNEL"
              ? "Evaluation submitted for Committee Review."
              : stage === "COMMITTEE"
                ? "Evaluation submitted for President review."
                : "Evaluation approved and finalized.";
      toast.success(message);
      await queryClient.invalidateQueries({ queryKey: ["phase2-evaluation", evaluationId] });
      navigate({
        to:
          stage === "RATER"
            ? "/supervisor/evaluations"
            : stage === "REVIEWING_SUPERVISOR"
              ? "/reviewing-supervisor"
              : stage === "PERSONNEL"
                ? "/personnel"
                : stage === "COMMITTEE"
                  ? "/committee"
                  : "/president/evaluations",
      });
    },
    onError: (error: Error) => toast.error(userErrorMessage(error, "Could not save this workflow stage.")),
  });
  if (query.isLoading) return <LoadingBlock rows={6} />;
  if (query.isError || !detail)
    return (
      <EmptyState
        title="Unable to open evaluation"
        description={query.error instanceof Error ? query.error.message : "Evaluation not found"}
      />
    );
  const field = (key: string, label: string, required = true) => (
    <div className="space-y-1.5">
      <Label htmlFor={`phase2-${key}`}>
        {label}
        {required ? " *" : ""}
      </Label>
      <Textarea
        id={`phase2-${key}`}
        value={values[key] ?? ""}
        onChange={(event) => update(key, event.target.value)}
        rows={3}
        disabled={mutation.isPending || !editable}
      />
    </div>
  );
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
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            {stage === "RATER"
              ? "Step 2 — Conclusions and comments"
              : stage === "REVIEWING_SUPERVISOR"
                ? "Step 3 — Review"
                : stage === "PERSONNEL"
                  ? "Complete evaluation file (for review)"
                  : stage === "COMMITTEE"
                    ? "Complete evaluation file (for review)"
                    : "Complete evaluation file (for review)"}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {stage === "REVIEWING_SUPERVISOR" ? (
            <>
              <div>
                <h3 className="mb-3 text-sm font-semibold">STEP 1 — Performance Evaluation</h3>
                <EvaluationRatingCards
                  criteria={detail.criteria}
                  values={ratings}
                  employeeValues={Object.fromEntries(detail.criteria.map((criterion) => [criterion.id, ratingFor(detail.ratings, criterion.id, "EMPLOYEE")]))}
                  supervisorValues={Object.fromEntries(detail.criteria.map((criterion) => [criterion.id, ratingFor(detail.ratings, criterion.id, "SUPERVISOR")]))}
                  readOnly={!editable}
                  onChange={(criterionId, value) => setRatings((current) => ({ ...current, [criterionId]: value }))}
                />
              </div>
              <div className="space-y-2 rounded-md border border-border p-4">
                <h3 className="font-semibold">STEP 2 — Conclusions and comments (read-only)</h3>
                {[
                  ["Overall rating explanation", "supervisor_step2_overall_explanation"],
                  ["Principal Strengths", "supervisor_step2_strengths"],
                  ["Principal Weakness", "supervisor_step2_weaknesses"],
                  ["Present-job effectiveness", "supervisor_step2_effectiveness"],
                  ["Development Potential", "supervisor_step2_development_potential"],
                  ["Advancement Outlook", "supervisor_step2_advancement_outlook"],
                  ["Growth and development suggestions", "supervisor_step2_growth_suggestions"],
                  ["Job / Transfer Interest", "supervisor_step2_transfer_interest"],
                  ["What Job?", "supervisor_step2_transfer_job"],
                  ["Where?", "supervisor_step2_transfer_where"],
                  ["Is Qualified?", "supervisor_step2_transfer_qualified"],
                  ["Other Comments and Recommendations", "supervisor_step2_other_comments"],
                  ["Rater Signature Date", "supervisor_step2_date"],
                ].map(([label, key]) => (
                  <div key={key}>
                    <p className="text-xs font-semibold text-muted-foreground">{label}</p>
                    <p className="whitespace-pre-wrap text-sm">{String((detail as Record<string, unknown>)[key] ?? "—")}</p>
                  </div>
                ))}
                {(detail as Record<string, unknown>)["rater_signature"] ? (
                  <div>
                    <p className="text-xs font-semibold text-muted-foreground">Rater Signature</p>
                    <img
                      src={String(((detail as Record<string, unknown>)["rater_signature"] as Record<string, unknown>)?.["signature_data"] ?? "")}
                      alt="Rater electronic signature"
                      className="mt-1 h-20 max-w-xs object-contain"
                    />
                  </div>
                ) : null}
              </div>
            </>
          ) : null}
          {["PERSONNEL", "COMMITTEE", "PRESIDENT"].includes(stage) ? (
            <>
              <div className="space-y-2 rounded-md border border-border p-4">
                <h3 className="font-semibold">STEP 1 — Performance Evaluation (read-only)</h3>
                <EvaluationRatingCards
                  criteria={detail.criteria}
                  values={Object.fromEntries(detail.criteria.map((criterion) => [criterion.id, null]))}
                  employeeValues={Object.fromEntries(detail.criteria.map((criterion) => [criterion.id, ratingFor(detail.ratings, criterion.id, "EMPLOYEE")]))}
                  supervisorValues={Object.fromEntries(detail.criteria.map((criterion) => [criterion.id, ratingFor(detail.ratings, criterion.id, "SUPERVISOR")]))}
                  reviewingValues={Object.fromEntries(detail.criteria.map((criterion) => [criterion.id, ratingFor(detail.ratings, criterion.id, "REVIEWING_SUPERVISOR")]))}
                  readOnly={true}
                  onChange={() => {}}
                />
              </div>
              <div className="space-y-2 rounded-md border border-border p-4">
                <h3 className="font-semibold">STEP 2 — Supervisor conclusions and comments (read-only)</h3>
                {[
                  ["Overall rating explanation", "supervisor_step2_overall_explanation"],
                  ["Principal Strengths", "supervisor_step2_strengths"],
                  ["Principal Weakness", "supervisor_step2_weaknesses"],
                  ["Present-job effectiveness", "supervisor_step2_effectiveness"],
                  ["Development Potential", "supervisor_step2_development_potential"],
                  ["Advancement Outlook", "supervisor_step2_advancement_outlook"],
                  ["Growth and development suggestions", "supervisor_step2_growth_suggestions"],
                  ["Job / Transfer Interest", "supervisor_step2_transfer_interest"],
                  ["What Job?", "supervisor_step2_transfer_job"],
                  ["Where?", "supervisor_step2_transfer_where"],
                  ["Is Qualified?", "supervisor_step2_transfer_qualified"],
                  ["Other Comments and Recommendations", "supervisor_step2_other_comments"],
                  ["Rater Signature Date", "supervisor_step2_date"],
                ].map(([label, key]) => (
                  <div key={key}>
                    <p className="text-xs font-semibold text-muted-foreground">{label}</p>
                    <p className="whitespace-pre-wrap text-sm">{String((detail as Record<string, unknown>)[key] ?? "—")}</p>
                  </div>
                ))}
              </div>
              <div className="space-y-2 rounded-md border border-border p-4">
                <h3 className="font-semibold">STEP 3 — Reviewing Supervisor review (read-only)</h3>
                {(() => {
                  const accStages = (detail as Record<string, unknown> & { accumulatedStages?: Record<string, unknown> })
                    ?.accumulatedStages as Record<string, unknown> | undefined;
                  const revSupReview = accStages?.reviewingSupervisorReview as Record<string, unknown> | undefined;
                  return revSupReview ? (
                    <>
                      <div>
                        <p className="text-xs font-semibold text-muted-foreground">Comments</p>
                        <p className="whitespace-pre-wrap text-sm">{String(revSupReview["comments"] ?? "—")}</p>
                      </div>
                      <div>
                        <p className="text-xs font-semibold text-muted-foreground">Recommendations</p>
                        <p className="whitespace-pre-wrap text-sm">{String(revSupReview["recommendations"] ?? "—")}</p>
                      </div>
                    </>
                  ) : (
                    <p className="text-sm text-muted-foreground">Reviewing Supervisor review not yet completed</p>
                  );
                })()}
              </div>
              {stage !== "PERSONNEL" && (() => {
                const accStages = (detail as Record<string, unknown> & { accumulatedStages?: Record<string, unknown> })
                  ?.accumulatedStages as Record<string, unknown> | undefined;
                const personnel = accStages?.personnelProcessing as Record<string, unknown> | undefined;
                return personnel && detail.status !== "PERSONNEL_PROCESSING" ? (
                  <div className="space-y-2 rounded-md border border-border p-4">
                    <h3 className="font-semibold">Personnel Office processing (read-only)</h3>
                    <div className="grid gap-4 sm:grid-cols-2 text-sm">
                      <div>
                        <p className="text-xs font-semibold text-muted-foreground">Present Salary</p>
                        <p>{String(personnel["present_salary"] ?? "—")}</p>
                      </div>
                      <div>
                        <p className="text-xs font-semibold text-muted-foreground">Last Increase Date</p>
                        <p>{String(personnel["last_increase_date"] ?? "—")}</p>
                      </div>
                      <div>
                        <p className="text-xs font-semibold text-muted-foreground">Last Increase Amount</p>
                        <p>{String(personnel["last_increase_amount"] ?? "—")}</p>
                      </div>
                      <div>
                        <p className="text-xs font-semibold text-muted-foreground">Total Points</p>
                        <p>{String(personnel["total_points"] ?? "—")}</p>
                      </div>
                      <div className="sm:col-span-2">
                        <p className="text-xs font-semibold text-muted-foreground">Nature of Last Increase</p>
                        <p className="whitespace-pre-wrap">{String(personnel["last_increase_nature"] ?? "—")}</p>
                      </div>
                      <div>
                        <p className="text-xs font-semibold text-muted-foreground">Adjective Rating</p>
                        <p>{String(personnel["adjective_rating"] ?? "—")}</p>
                      </div>
                      <div>
                        <p className="text-xs font-semibold text-muted-foreground">Recommended Increase / Bonus</p>
                        <p className="whitespace-pre-wrap">{String(personnel["recommended_increase_bonus"] ?? "—")}</p>
                      </div>
                    </div>
                  </div>
                ) : null;
              })()}
              {stage !== "COMMITTEE" && (() => {
                const accStages = (detail as Record<string, unknown> & { accumulatedStages?: Record<string, unknown> })
                  ?.accumulatedStages as Record<string, unknown> | undefined;
                const committee = accStages?.committeeReview as Record<string, unknown> | undefined;
                return committee && detail.status !== "COMMITTEE_REVIEW" ? (
                  <div className="space-y-2 rounded-md border border-border p-4">
                    <h3 className="font-semibold">Committee recommendation (read-only)</h3>
                    <div className="space-y-2 text-sm">
                      <div>
                        <p className="text-xs font-semibold text-muted-foreground">Final Action</p>
                        <p>{String(committee["final_action"] ?? "—")}</p>
                      </div>
                      <div>
                        <p className="text-xs font-semibold text-muted-foreground">Action Details</p>
                        <p className="whitespace-pre-wrap">{String(committee["action_details"] ?? "—")}</p>
                      </div>
                      <div>
                        <p className="text-xs font-semibold text-muted-foreground">Committee Recommendation</p>
                        <p className="whitespace-pre-wrap">{String(committee["recommendation"] ?? "—")}</p>
                      </div>
                    </div>
                  </div>
                ) : null;
              })()}
            </>
          ) : null}
          {stage === "PRESIDENT" ? (
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="outline" onClick={() => openDocument("preview", true)}>Preview Evaluation</Button>
              <Button type="button" variant="outline" onClick={() => openDocument("print", true)}>Print / Export PDF</Button>
              <Button type="button" variant="secondary" onClick={() => openDocument("preview", true)}>Refresh PDF</Button>
            </div>
          ) : null}
          {stage === "RATER" ? (
            <>
              {field("strengths", "Strengths")} {field("weaknesses", "Weaknesses")}{" "}
              {field("development", "Development")} {field("advancement", "Advancement")}{" "}
              {field("careerTransfer", "Career / transfer")}{" "}
              {field("recommendations", "Other recommendations")}
            </>
          ) : stage === "REVIEWING_SUPERVISOR" ? (
            <>
              {field("comments", "Comments")} {field("recommendations", "Recommendations")}
              <div className="space-y-1.5">
                <Label htmlFor="phase2-date">Date *</Label>
                <Input id="phase2-date" type="date" value={values.date ?? workflowDate()} onChange={(event) => update("date", event.target.value)} disabled={!editable} readOnly />
              </div>
            </>
          ) : stage === "PERSONNEL" ? (
            <>
              <h3 className="text-sm font-semibold">Personnel Office section — editable</h3>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <Label>Present salary</Label>
                  <Input
                    type="number"
                    value={values.presentSalary ?? ""}
                    onChange={(event) => update("presentSalary", event.target.value)}
                    disabled={!editable}
                  />
                </div>
                <div>
                  <Label>Last increase date</Label>
                  <Input
                    type="date"
                    value={values.lastIncreaseDate ?? ""}
                    onChange={(event) => update("lastIncreaseDate", event.target.value)}
                    disabled={!editable}
                  />
                </div>
                <div>
                  <Label>Last increase amount</Label>
                  <Input
                    type="number"
                    value={values.lastIncreaseAmount ?? ""}
                    onChange={(event) => update("lastIncreaseAmount", event.target.value)}
                    disabled={!editable}
                  />
                </div>
                <div>
                  <Label>Total points</Label>
                  <Input
                    type="number"
                    value={values.totalPoints ?? ""}
                    onChange={(event) => update("totalPoints", event.target.value)}
                    disabled={!editable}
                  />
                </div>
              </div>
              {field("lastIncreaseNature", "Nature of last increase", false)}
              {field("adjectiveRating", "Adjective rating")}
              {field("recommendedIncreaseBonus", "Recommended increase / bonus")}
            </>
          ) : stage === "COMMITTEE" ? (
            <>
              <h3 className="text-sm font-semibold">Committee recommendation — editable</h3>
              <div>
                <Label>Final action *</Label>
                <select
                  className="h-10 w-full rounded-md border border-input bg-background px-3"
                  value={action}
                  onChange={(event) => setAction(event.target.value)}
                  disabled={!editable}
                >
                  {[
                    ["RETAIN", "Retain"],
                    ["TRANSFER", "Transfer"],
                    ["PROMOTE", "Promote"],
                    ["INCREASE_SALARY", "Increase Salary"],
                    ["TRAINING_REQUIRED", "Training Required"],
                    ["OTHER", "Other"],
                  ].map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </div>
              {field("actionDetails", "Action details", false)}
              {field("recommendations", "Committee recommendation")}
            </>
          ) : (
            <>
              <h3 className="text-sm font-semibold">President final approval — editable</h3>
              <div>
                <Label>Decision *</Label>
                <select
                  className="h-10 w-full rounded-md border border-input bg-background px-3"
                  value={values.approve ?? "true"}
                  onChange={(event) => update("approve", event.target.value)}
                  disabled={!editable}
                >
                  <option value="true">Approve and finalize</option>
                  <option value="false">Return for correction</option>
                </select>
              </div>
              {values.approve === "false" ? (
                <div>
                  <Label>Correction reason *</Label>
                  <Textarea
                    value={reason}
                    onChange={(event) => setReason(event.target.value)}
                    rows={3}
                    disabled={!editable}
                  />
                  <Label htmlFor="phase2-correction-stage">Return to stage *</Label>
                  <select
                    id="phase2-correction-stage"
                    className="h-10 w-full rounded-md border border-input bg-background px-3"
                    value={correctionStage}
                    onChange={(event) => setCorrectionStage(event.target.value)}
                    disabled={!editable}
                  >
                    <option value="SUPERVISOR_DRAFT">Rater Step 2</option>
                    <option value="REVIEWING_SUPERVISOR_REVIEW">Reviewing Supervisor Step 3</option>
                    <option value="PERSONNEL_PROCESSING">Personnel processing</option>
                    <option value="COMMITTEE_REVIEW">Committee review</option>
                  </select>
                </div>
              ) : null}
            </>
          )}
          <SignatureField {...(signature ? { value: signature } : {})} disabled={!editable} onChange={setSignature} />
          <div className="flex gap-2">
            <Button
              onClick={() => mutation.mutate(true)}
              disabled={mutation.isPending || !editable}
            >
              {mutation.isPending ? "Saving..." : "Submit stage"}
            </Button>
            <Button
              variant="outline"
              onClick={() => mutation.mutate(false)}
              disabled={mutation.isPending || !editable}
            >
              Save draft
            </Button>
            <Button
              variant="outline"
              onClick={() =>
                navigate({
                  to:
                    stage === "RATER"
                      ? "/supervisor/evaluations"
                      : stage === "REVIEWING_SUPERVISOR"
                        ? "/reviewing-supervisor"
                        : stage === "PERSONNEL"
                          ? "/personnel"
                          : stage === "COMMITTEE"
                            ? "/committee"
                            : "/president/evaluations",
                })
              }
            >
              Back to queue
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
