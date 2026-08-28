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
import { EmptyState, EvaluationStatusBadge, LoadingBlock, PageHeader } from "@/components/ui-bits";
import {
  getPhase2Evaluation,
  approveEvaluation,
  saveRaterStep2,
  submitCommitteeReview,
  submitPersonnelProcessing,
  submitReviewingSupervisor,
} from "@/lib/phase2.functions";

type Stage = "RATER" | "REVIEWING_SUPERVISOR" | "PERSONNEL" | "COMMITTEE" | "PRESIDENT";

export function Phase2StageDetail({ stage, evaluationId }: { stage: Stage; evaluationId: string }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const fetch = useServerFn(getPhase2Evaluation);
  const query = useQuery({
    queryKey: ["phase2-evaluation", evaluationId],
    queryFn: () => fetch({ data: { evaluationId, stage } }),
    retry: false,
  });
  const detail = query.data;
  const [values, setValues] = useState<Phase2Values>({});
  const [signature, setSignature] = useState("");
  const [action, setAction] = useState("RETAIN");
  const [reason, setReason] = useState("");
  const [correctionStage, setCorrectionStage] = useState("SUPERVISOR_DRAFT");
  const editableStatuses = {
    RATER: ["EMPLOYEE_SUBMITTED", "SUPERVISOR_DRAFT"],
    REVIEWING_SUPERVISOR: ["REVIEWING_SUPERVISOR_REVIEW"],
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
    if (stage === "RATER")
      setValues({
        strengths: String(source["supervisor_step2_strengths"] ?? ""),
        weaknesses: String(source["supervisor_step2_weaknesses"] ?? ""),
        development: String(source["supervisor_step2_development"] ?? ""),
        advancement: String(source["supervisor_step2_advancement"] ?? ""),
        careerTransfer: String(source["supervisor_step2_career_transfer"] ?? ""),
        recommendations: String(source["supervisor_step2_recommendations"] ?? ""),
      });
    if (stage === "REVIEWING_SUPERVISOR" && record)
      setValues({
        comments: String(record["comments"] ?? ""),
        recommendations: String(record["recommendations"] ?? ""),
      });
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
  }, [detail, stage]);
  const update = (key: string, value: string) =>
    setValues((current) => ({ ...current, [key]: value }));
  const mutation = useMutation({
    mutationFn: async (submit: boolean) => {
      if (!detail) throw new Error("Evaluation unavailable");
      const base = {
        evaluationId,
        version: detail.version,
        submit,
        signature: signature ? { method: "TYPED" as const, data: signature } : undefined,
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
          },
        });
      if (stage === "REVIEWING_SUPERVISOR")
        return submitReviewingSupervisor({
          data: {
            ...base,
            comments: values.comments ?? "",
            recommendations: values.recommendations ?? "",
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
          signature: signature ? { method: "TYPED", data: signature } : undefined,
        },
      });
    },
    onSuccess: async () => {
      toast.success("Workflow stage saved");
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
    onError: (error: Error) => toast.error(error.message.replace("VALIDATION:", "").trim()),
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
        <CardContent className="grid gap-3 text-sm sm:grid-cols-2">
          <p>
            <b>Name:</b> {detail.full_name_snapshot}
          </p>
          <p>
            <b>Job title:</b> {detail.job_title_snapshot}
          </p>
          <p>
            <b>Division:</b> {detail.division_snapshot}
          </p>
          <p>
            <b>Section:</b> {detail.section_snapshot}
          </p>
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
                  ? "Personnel processing"
                  : stage === "COMMITTEE"
                    ? "Committee recommendation"
                    : "President final approval"}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
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
            </>
          ) : stage === "PERSONNEL" ? (
            <>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <Label>Present salary</Label>
                  <Input
                    type="number"
                    value={values.presentSalary ?? ""}
                    onChange={(event) => update("presentSalary", event.target.value)}
                  />
                </div>
                <div>
                  <Label>Last increase date</Label>
                  <Input
                    type="date"
                    value={values.lastIncreaseDate ?? ""}
                    onChange={(event) => update("lastIncreaseDate", event.target.value)}
                  />
                </div>
                <div>
                  <Label>Last increase amount</Label>
                  <Input
                    type="number"
                    value={values.lastIncreaseAmount ?? ""}
                    onChange={(event) => update("lastIncreaseAmount", event.target.value)}
                  />
                </div>
                <div>
                  <Label>Total points</Label>
                  <Input
                    type="number"
                    value={values.totalPoints ?? ""}
                    onChange={(event) => update("totalPoints", event.target.value)}
                  />
                </div>
              </div>
              {field("lastIncreaseNature", "Nature of last increase", false)}
              {field("adjectiveRating", "Adjective rating")}
              {field("recommendedIncreaseBonus", "Recommended increase / bonus")}
            </>
          ) : stage === "COMMITTEE" ? (
            <>
              <div>
                <Label>Final action *</Label>
                <select
                  className="h-10 w-full rounded-md border border-input bg-background px-3"
                  value={action}
                  onChange={(event) => setAction(event.target.value)}
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
              <div>
                <Label>Decision *</Label>
                <select
                  className="h-10 w-full rounded-md border border-input bg-background px-3"
                  value={values.approve ?? "true"}
                  onChange={(event) => update("approve", event.target.value)}
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
                  />
                  <Label htmlFor="phase2-correction-stage">Return to stage *</Label>
                  <select
                    id="phase2-correction-stage"
                    className="h-10 w-full rounded-md border border-input bg-background px-3"
                    value={correctionStage}
                    onChange={(event) => setCorrectionStage(event.target.value)}
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
          <div className="space-y-1.5">
            <Label htmlFor="phase2-signature">Signature</Label>
            <Input
              id="phase2-signature"
              placeholder="Type your full name as signature"
              value={signature}
              onChange={(event) => setSignature(event.target.value)}
            />
          </div>
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
