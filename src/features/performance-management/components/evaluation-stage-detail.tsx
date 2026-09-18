import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
type EvaluationStageValues = {
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
import { Table, TableBody, TableCell, TableHeader, TableHead, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  EvaluationRatingCards,
  ratingFor,
} from "@/features/performance-management/components/rating-matrix";
import {
  SignatureField,
  type SignatureValue,
} from "@/features/performance-management/components/signature-field";
import { EvaluationDocumentPreview } from "@/features/performance-management/components/evaluation-document-preview";
import {
  EmptyState,
  EvaluationStatusBadge,
  LoadingBlock,
  formatDateTime,
} from "@/components/shared/shared-ui";
import { TextShimmer } from "@/components/loading-ui/text-shimmer";
import {
  getEvaluationStage,
  approveEvaluation,
  saveRaterStep2,
  saveEvaluationSignature,
  submitCommitteeReview,
  submitPersonnelProcessing,
  submitReviewingSupervisor,
} from "@/lib/evaluation-workflow.functions";
import { getEvaluationSheetHtml } from "@/lib/documents.functions";
import { userErrorMessage } from "@/lib/validation";
import {
  recordReviewingSupervisorAiAction,
  suggestReviewingSupervisorFields,
  recordCommitteeTrainingRecommendationAction,
  suggestCommitteeTrainingRecommendation,
  type CommitteeTrainingRecommendation,
} from "@/lib/ai.functions";
import type { EvaluationDetail } from "@/lib/domain";

type Stage = "RATER" | "REVIEWING_SUPERVISOR" | "PERSONNEL" | "COMMITTEE" | "PRESIDENT";
type ReviewSuggestion = { suggestion: string; provider: "openrouter" | "development-mock" };
type ReviewAiSuggestions = {
  comments?: ReviewSuggestion;
  recommendations?: ReviewSuggestion;
};
type ReviewAiEditing = {
  comments?: boolean;
  recommendations?: boolean;
};

type StageDetail = EvaluationDetail & {
  correction_stage?: string;
  stageRecord?: Record<string, unknown> | null;
  stageSignature?: {
    method: "DRAWN" | "UPLOAD" | "TYPED";
    signature_data: string | null;
  } | null;
  accumulatedStages?: Record<string, unknown>;
  score?: {
    finalScore: number | null;
    finalRatingLabel: string | null;
  } | null;
};

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-0.5 font-medium text-foreground">{value || "-"}</p>
    </div>
  );
}

function transferInterestLabel(value: unknown) {
  return String(value ?? "").toUpperCase() === "NOT_AWARE" ? "NOT AWARE" : String(value ?? "-");
}

function ReadOnlyField({
  label,
  value,
  className = "",
}: {
  label: string;
  value: unknown;
  className?: string;
}) {
  return (
    <div className={className}>
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-1 w-full max-w-none break-words whitespace-pre-wrap pr-1 text-sm leading-6 text-foreground lg:pr-3">
        {String(value ?? "-") || "-"}
      </p>
    </div>
  );
}

function ReadOnlyGroup({
  title,
  children,
  className = "",
}: {
  title: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={`space-y-3 ${className}`}>
      <h3 className="text-sm font-semibold tracking-tight text-foreground">{title}</h3>
      {children}
    </section>
  );
}

function ReviewAiField({
  label,
  field,
  value,
  suggestion,
  editing,
  editable,
  onChange,
  onSuggestionChange,
  onToggleEdit,
  onUse,
  onDiscard,
}: {
  label: string;
  field: string;
  value: string;
  suggestion?: ReviewSuggestion | undefined;
  editing: boolean;
  editable: boolean;
  onChange: (value: string) => void;
  onSuggestionChange: (value: string) => void;
  onToggleEdit: () => void;
  onUse: () => void;
  onDiscard: () => void;
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={`reviewing-${field}`}>{label} *</Label>
      <Textarea
        id={`reviewing-${field}`}
        value={value}
        rows={3}
        onChange={(event) => onChange(event.target.value)}
        disabled={!editable}
      />
      {suggestion ? (
        <div className="rounded-md border border-dashed border-primary/40 bg-primary/5 p-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-primary">
            AI suggestion
          </p>
          <Textarea
            aria-label={`${label} AI suggestion`}
            className="mt-2 bg-background"
            rows={3}
            value={suggestion.suggestion}
            readOnly={!editing || !editable}
            onChange={(event) => onSuggestionChange(event.target.value)}
          />
          {suggestion.provider === "development-mock" ? (
            <p className="mt-1 text-xs text-amber-700">
              Development mock output. This is not real AI analysis.
            </p>
          ) : null}
          <div className="mt-2 flex gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={!editable}
              onClick={onToggleEdit}
            >
              {editing ? "Done" : "Edit"}
            </Button>
            <Button type="button" size="sm" disabled={!editable} onClick={onUse}>
              Use suggestion
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={onDiscard}>
              Discard
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function EvaluationStageDetail({
  stage,
  evaluationId,
}: {
  stage: Stage;
  evaluationId: string;
}) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const fetch = useServerFn(getEvaluationStage);
  const getSheetHtml = useServerFn(getEvaluationSheetHtml);
  const getReviewingSuggestions = useServerFn(suggestReviewingSupervisorFields);
  const recordReviewingAction = useServerFn(recordReviewingSupervisorAiAction);
  const getCommitteeTrainingRecommendation = useServerFn(suggestCommitteeTrainingRecommendation);
  const recordCommitteeTrainingAction = useServerFn(recordCommitteeTrainingRecommendationAction);
  const saveSignature = useServerFn(saveEvaluationSignature);
  const query = useQuery({
    queryKey: ["phase2-evaluation", evaluationId],
    queryFn: () => fetch({ data: { evaluationId, stage } }),
    retry: false,
  });
  const detail = query.data as StageDetail | null | undefined;
  const [values, setValues] = useState<EvaluationStageValues>({});
  const [ratings, setRatings] = useState<Record<string, number | null>>({});
  const [signature, setSignature] = useState<SignatureValue | undefined>();
  const [action, setAction] = useState("RETAIN");
  const [reason, setReason] = useState("");
  const [correctionStage, setCorrectionStage] = useState("SUPERVISOR_DRAFT");
  const [documentHtml, setDocumentHtml] = useState<string | null>(null);
  const [documentOpen, setDocumentOpen] = useState(false);
  const [reviewAiSuggestions, setReviewAiSuggestions] = useState<ReviewAiSuggestions>({});
  const [reviewAiEditing, setReviewAiEditing] = useState<ReviewAiEditing>({});
  const [reviewAiBusy, setReviewAiBusy] = useState(false);
  const [reviewAiUnavailable, setReviewAiUnavailable] = useState("");
  const [committeeTrainingRecommendation, setCommitteeTrainingRecommendation] =
    useState<CommitteeTrainingRecommendation | null>(null);
  const [committeeTrainingBusy, setCommitteeTrainingBusy] = useState(false);
  const [committeeTrainingUnavailable, setCommitteeTrainingUnavailable] = useState("");
  const workflowDate = () => new Date().toISOString();
  const editableStatuses = {
    RATER: ["SUBMITTED", "DRAFT"],
    REVIEWING_SUPERVISOR: ["FOR_REVIEW"],
    PERSONNEL: ["FOR_PROCESSING"],
    COMMITTEE: ["FOR_REVIEW"],
    PRESIDENT: ["FOR_APPROVAL"],
  }[stage];
  const targetStatus =
    stage === "RATER"
      ? "DRAFT"
      : stage === "REVIEWING_SUPERVISOR"
        ? "FOR_REVIEW"
        : stage === "PERSONNEL"
          ? "FOR_PROCESSING"
          : stage === "COMMITTEE"
            ? "FOR_REVIEW"
            : "FOR_APPROVAL";
  const correctionTarget = (detail as (typeof detail & { correction_stage?: string }) | undefined)
    ?.correction_stage;
  const correctionStageForView =
    stage === "RATER"
      ? "SUPERVISOR_DRAFT"
      : stage === "REVIEWING_SUPERVISOR"
        ? "REVIEWING_SUPERVISOR_REVIEW"
        : stage === "PERSONNEL"
          ? "PERSONNEL_PROCESSING"
          : stage === "COMMITTEE"
            ? "COMMITTEE_REVIEW"
            : "PRESIDENT_APPROVAL";
  const editable =
    editableStatuses.includes(detail?.status ?? "") ||
    (detail?.status === "RETURNED" && correctionTarget === correctionStageForView);
  async function persistSignature() {
    if (!detail || !signature) return;
    const signatureStage =
      stage === "REVIEWING_SUPERVISOR"
        ? "REVIEWING_SUPERVISOR_STEP3"
        : stage === "PERSONNEL"
          ? "PERSONNEL"
          : stage === "COMMITTEE"
            ? "COMMITTEE"
            : "PRESIDENT";
    await saveSignature({
      data: { evaluationId, version: detail.version, stage: signatureStage, signature },
    });
    await queryClient.invalidateQueries({ queryKey: ["phase2-evaluation", evaluationId] });
  }
  useEffect(() => {
    if (!detail) return;
    const record = (detail as typeof detail & { stageRecord?: Record<string, unknown> })
      .stageRecord;
    const source = detail as typeof detail & Record<string, unknown>;
    const savedStageSignature = source["stageSignature"] as {
      method: "DRAWN" | "UPLOAD" | "TYPED";
      signature_data: string | null;
    } | null;
    if (
      savedStageSignature?.signature_data &&
      (savedStageSignature.method === "DRAWN" ||
        savedStageSignature.method === "UPLOAD" ||
        savedStageSignature.method === "TYPED")
    )
      setSignature({
        method: savedStageSignature.method === "TYPED" ? "DRAWN" : savedStageSignature.method,
        data: savedStageSignature.signature_data,
      });
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

  async function generateReviewSuggestions() {
    if (!detail || stage !== "REVIEWING_SUPERVISOR") return;
    setReviewAiBusy(true);
    setReviewAiUnavailable("");
    try {
      const result = await getReviewingSuggestions({
        data: {
          evaluationId,
          version: detail.version,
          reviewingRatings: Object.entries(ratings)
            .filter(([, rating]) => typeof rating === "number")
            .map(([criterionId, rating]) => ({ criterionId, rating: rating as number })),
          currentValues: {
            comments: values.comments ?? "",
            recommendations: values.recommendations ?? "",
          },
          actionId: crypto.randomUUID(),
          regenerate: Object.keys(reviewAiSuggestions).length > 0,
        },
      });
      setReviewAiSuggestions(
        Object.fromEntries(
          Object.entries(result.suggestions).map(([field, suggestion]) => [
            field,
            { suggestion, provider: result.provider },
          ]),
        ),
      );
      setReviewAiEditing({});
    } catch (error) {
      const message = userErrorMessage(
        error,
        "AI assistance unavailable. You can complete these fields manually.",
      );
      setReviewAiUnavailable(message);
      toast.error(message);
    } finally {
      setReviewAiBusy(false);
    }
  }

  async function generateCommitteeTrainingRecommendation() {
    if (!detail || stage !== "COMMITTEE") return;
    setCommitteeTrainingBusy(true);
    setCommitteeTrainingUnavailable("");
    try {
      const result = await getCommitteeTrainingRecommendation({
        data: {
          evaluationId,
          version: detail.version,
          currentValues: {
            actionDetails: values.actionDetails ?? "",
            recommendation: values.recommendations ?? "",
          },
          actionId: crypto.randomUUID(),
          regenerate: committeeTrainingRecommendation !== null,
        },
      });
      setCommitteeTrainingRecommendation(result);
    } catch (error) {
      const message = userErrorMessage(
        error,
        "AI training recommendation unavailable. You can complete these fields manually.",
      );
      setCommitteeTrainingUnavailable(message);
      toast.error(message);
    } finally {
      setCommitteeTrainingBusy(false);
    }
  }

  function useCommitteeTrainingRecommendation() {
    if (!committeeTrainingRecommendation || !detail) return;
    if (committeeTrainingRecommendation.recommendedTraining)
      update("actionDetails", committeeTrainingRecommendation.recommendedTraining);
    if (committeeTrainingRecommendation.rationale)
      update("recommendations", committeeTrainingRecommendation.rationale);
    void recordCommitteeTrainingAction({
      data: {
        evaluationId,
        version: detail.version,
        action: "ACCEPTED",
        actionId: crypto.randomUUID(),
        edited: false,
      },
    }).catch(() => undefined);
    setCommitteeTrainingRecommendation(null);
  }

  function discardCommitteeTrainingRecommendation() {
    if (!detail) return;
    void recordCommitteeTrainingAction({
      data: {
        evaluationId,
        version: detail.version,
        action: "DISMISSED",
        actionId: crypto.randomUUID(),
        edited: false,
      },
    }).catch(() => undefined);
    setCommitteeTrainingRecommendation(null);
  }

  function applyReviewSuggestion(field: "comments" | "recommendations") {
    const suggestion = reviewAiSuggestions[field];
    if (!suggestion) return;
    update(field, suggestion.suggestion);
    void recordReviewingAction({
      data: {
        evaluationId,
        version: detail?.version ?? 1,
        field,
        action: "ACCEPTED",
        actionId: crypto.randomUUID(),
        edited: Boolean(reviewAiEditing[field]),
      },
    }).catch(() => undefined);
    setReviewAiSuggestions((current) => {
      const next = { ...current };
      delete next[field];
      return next;
    });
  }

  function discardReviewSuggestion(field: "comments" | "recommendations") {
    void recordReviewingAction({
      data: {
        evaluationId,
        version: detail?.version ?? 1,
        field,
        action: "DISMISSED",
        actionId: crypto.randomUUID(),
        edited: Boolean(reviewAiEditing[field]),
      },
    }).catch(() => undefined);
    setReviewAiSuggestions((current) => {
      const next = { ...current };
      delete next[field];
      return next;
    });
  }

  function editReviewSuggestion(field: "comments" | "recommendations", value: string) {
    setReviewAiSuggestions((current) => ({
      ...current,
      [field]: {
        ...(current[field] ?? { suggestion: "", provider: "development-mock" as const }),
        suggestion: value,
      },
    }));
  }
  async function openDocument() {
    setDocumentOpen(true);
    try {
      const params = { evaluationId };
      if (stage === "PRESIDENT" && signature) {
        Object.assign(params, { presidentSignatureData: signature.data });
      }
      const result = await getSheetHtml({ data: params });
      setDocumentHtml(result.html);
    } catch (error) {
      setDocumentOpen(false);
      toast.error(
        error instanceof Error ? error.message : "The evaluation document is not available yet.",
      );
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
            ratings: Object.entries(ratings)
              .filter(([, rating]) => rating !== null)
              .map(([criterionId, rating]) => ({ criterionId, rating: rating! })),
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
            totalPoints: detail.score?.finalScore ?? null,
            adjectiveRating: detail.score?.finalRatingLabel ?? "",
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
    onSuccess: async (_result, submit) => {
      if (!submit) {
        toast.success("Draft saved");
        await queryClient.invalidateQueries({ queryKey: ["phase2-evaluation", evaluationId] });
        await queryClient.invalidateQueries({ queryKey: ["phase2-queue"] });
        return;
      }
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
      await queryClient.invalidateQueries({ queryKey: ["phase2-queue"] });
      if (stage === "RATER") {
        await queryClient.invalidateQueries({ queryKey: ["supervisor-queue"] });
      }
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
    onError: (error: Error) =>
      toast.error(userErrorMessage(error, "Could not save this workflow stage.")),
  });
  if (query.isLoading) return <LoadingBlock rows={6} variant="detail" />;
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
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Employee information</CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="max-w-full overflow-hidden border border-border bg-card shadow-sm">
            <Table className="w-full min-w-0 table-fixed">
              <caption className="sr-only">Employee information</caption>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[12%] whitespace-nowrap">Employee ID</TableHead>
                  <TableHead className="w-[19%]">Full Name</TableHead>
                  <TableHead className="w-[14%]">Job Title</TableHead>
                  <TableHead className="w-[16%]">Division / Department</TableHead>
                  <TableHead className="w-[14%]">Section / Unit</TableHead>
                  <TableHead className="w-[18%]">Cycle</TableHead>
                  <TableHead className="w-[17%] whitespace-nowrap">Date Submitted</TableHead>
                  <TableHead className="w-[12%] whitespace-nowrap">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                <TableRow>
                  <TableCell className="whitespace-nowrap tabular-nums">
                    {detail.employee_number_snapshot}
                  </TableCell>
                  <TableCell className="whitespace-normal break-words font-medium">
                    {detail.full_name_snapshot}
                  </TableCell>
                  <TableCell className="whitespace-normal break-words">
                    {detail.job_title_snapshot || "—"}
                  </TableCell>
                  <TableCell className="whitespace-normal break-words">
                    {detail.division_snapshot || "—"}
                  </TableCell>
                  <TableCell className="whitespace-normal break-words">
                    {detail.section_snapshot || "—"}
                  </TableCell>
                  <TableCell className="whitespace-normal break-words">
                    {detail.cycle_name} ({detail.cycle_year})
                  </TableCell>
                  <TableCell className="whitespace-normal break-words text-xs text-muted-foreground">
                    {formatDateTime(detail.employee_submitted_at)}
                  </TableCell>
                  <TableCell className="whitespace-nowrap">
                    <EvaluationStatusBadge status={detail.status} />
                  </TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-4">
          <CardTitle className="text-base">
            {stage === "RATER"
              ? "Step 2 - Conclusions and comments"
              : stage === "REVIEWING_SUPERVISOR"
                ? "Step 3 - Review"
                : stage === "PERSONNEL"
                  ? "Complete evaluation file (for review)"
                  : stage === "COMMITTEE"
                    ? "Complete evaluation file (for review)"
                    : "Complete evaluation file (for review)"}
          </CardTitle>
          {stage === "REVIEWING_SUPERVISOR" ? (
            <div className="flex shrink-0 flex-col items-end gap-1 text-right">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={reviewAiBusy || !editable}
                onClick={generateReviewSuggestions}
              >
                {reviewAiBusy ? <TextShimmer>Generating...</TextShimmer> : "AI Suggestions"}
              </Button>
              <span className="text-xs text-muted-foreground">
                Advisory suggestions from A-J ratings.
              </span>
            </div>
          ) : null}
        </CardHeader>
        <CardContent className="space-y-6">
          {stage === "REVIEWING_SUPERVISOR" ? (
            <>
              <div>
                <h3 className="mb-3 text-sm font-semibold">STEP 1 - Performance Evaluation</h3>
                <EvaluationRatingCards
                  criteria={detail.criteria}
                  values={ratings}
                  employeeValues={Object.fromEntries(
                    detail.criteria.map((criterion) => [
                      criterion.id,
                      ratingFor(detail.ratings, criterion.id, "EMPLOYEE"),
                    ]),
                  )}
                  supervisorValues={Object.fromEntries(
                    detail.criteria.map((criterion) => [
                      criterion.id,
                      ratingFor(detail.ratings, criterion.id, "SUPERVISOR"),
                    ]),
                  )}
                  readOnly={!editable}
                  onChange={(criterionId, value) =>
                    setRatings((current) => ({ ...current, [criterionId]: value }))
                  }
                />
              </div>
              <div className="rounded-md bg-muted/20 p-4">
                <ReadOnlyGroup title="STEP 2 - Conclusions and comments (read-only)">
                  <div className="space-y-4">
                    <ReadOnlyField
                      label="Overall rating explanation"
                      value={
                        (detail as Record<string, unknown>)["supervisor_step2_overall_explanation"]
                      }
                    />
                    <div className="grid items-start gap-4 lg:grid-cols-2">
                      <ReadOnlyField
                        label="Principal Strengths"
                        value={(detail as Record<string, unknown>)["supervisor_step2_strengths"]}
                      />
                      <ReadOnlyField
                        label="Principal Weakness"
                        value={(detail as Record<string, unknown>)["supervisor_step2_weaknesses"]}
                      />
                    </div>
                    <ReadOnlyField
                      label="Present-job effectiveness"
                      value={(detail as Record<string, unknown>)["supervisor_step2_effectiveness"]}
                    />
                    <div className="grid items-start gap-4 lg:grid-cols-2">
                      <ReadOnlyField
                        label="Development Potential"
                        value={
                          (detail as Record<string, unknown>)[
                            "supervisor_step2_development_potential"
                          ]
                        }
                      />
                      <ReadOnlyField
                        label="Advancement Outlook"
                        value={
                          (detail as Record<string, unknown>)[
                            "supervisor_step2_advancement_outlook"
                          ]
                        }
                      />
                    </div>
                    <ReadOnlyField
                      className="w-full"
                      label="Growth and development suggestions"
                      value={
                        (detail as Record<string, unknown>)["supervisor_step2_growth_suggestions"]
                      }
                    />
                    <div className="grid items-start gap-4 lg:grid-cols-4">
                      <ReadOnlyField
                        label="Job / Transfer Interest"
                        value={
                          transferInterestLabel(
                            (detail as Record<string, unknown>)["supervisor_step2_transfer_interest"],
                          )
                        }
                      />
                      {String(
                        (detail as Record<string, unknown>)["supervisor_step2_transfer_interest"] ??
                          "",
                      ) === "YES" ? (
                        <>
                          <ReadOnlyField
                            label="What Job?"
                            value={
                              (detail as Record<string, unknown>)["supervisor_step2_transfer_job"]
                            }
                          />
                          <ReadOnlyField
                            label="Where?"
                            value={
                              (detail as Record<string, unknown>)["supervisor_step2_transfer_where"]
                            }
                          />
                          <ReadOnlyField
                            label="Is Qualified?"
                            value={
                              (detail as Record<string, unknown>)[
                                "supervisor_step2_transfer_qualified"
                              ]
                            }
                          />
                        </>
                      ) : null}
                    </div>
                    <ReadOnlyField
                      className="w-full"
                      label="Other Comments and Recommendations"
                      value={(detail as Record<string, unknown>)["supervisor_step2_other_comments"]}
                    />
                    <ReadOnlyField
                      label="Rater Signature Date"
                      value={(detail as Record<string, unknown>)["supervisor_step2_date"]}
                    />
                  </div>
                </ReadOnlyGroup>
                {(detail as Record<string, unknown>)["rater_signature"] ? (
                  <div className="mt-4 border-t border-border/60 pt-4">
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Rater Signature
                    </p>
                    <img
                      src={String(
                        (
                          (detail as Record<string, unknown>)["rater_signature"] as Record<
                            string,
                            unknown
                          >
                        )?.["signature_data"] ?? "",
                      )}
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
                <h3 className="font-semibold">STEP 1 - Performance Evaluation (read-only)</h3>
                <EvaluationRatingCards
                  criteria={detail.criteria}
                  values={Object.fromEntries(
                    detail.criteria.map((criterion) => [criterion.id, null]),
                  )}
                  employeeValues={Object.fromEntries(
                    detail.criteria.map((criterion) => [
                      criterion.id,
                      ratingFor(detail.ratings, criterion.id, "EMPLOYEE"),
                    ]),
                  )}
                  supervisorValues={Object.fromEntries(
                    detail.criteria.map((criterion) => [
                      criterion.id,
                      ratingFor(detail.ratings, criterion.id, "SUPERVISOR"),
                    ]),
                  )}
                  reviewingValues={Object.fromEntries(
                    detail.criteria.map((criterion) => [
                      criterion.id,
                      ratingFor(detail.ratings, criterion.id, "REVIEWING_SUPERVISOR"),
                    ]),
                  )}
                  readOnly={true}
                  onChange={() => {}}
                />
              </div>
              <div className="rounded-md bg-muted/20 p-4">
                <ReadOnlyGroup title="STEP 2 - Supervisor conclusions and comments (read-only)">
                  <div className="space-y-4">
                    <ReadOnlyField
                      label="Overall rating explanation"
                      value={
                        (detail as Record<string, unknown>)["supervisor_step2_overall_explanation"]
                      }
                    />
                    <div className="grid items-start gap-4 lg:grid-cols-2">
                      <ReadOnlyField
                        label="Principal Strengths"
                        value={(detail as Record<string, unknown>)["supervisor_step2_strengths"]}
                      />
                      <ReadOnlyField
                        label="Principal Weakness"
                        value={(detail as Record<string, unknown>)["supervisor_step2_weaknesses"]}
                      />
                    </div>
                    <ReadOnlyField
                      label="Present-job effectiveness"
                      value={(detail as Record<string, unknown>)["supervisor_step2_effectiveness"]}
                    />
                    <div className="grid items-start gap-4 lg:grid-cols-2">
                      <ReadOnlyField
                        label="Development Potential"
                        value={
                          (detail as Record<string, unknown>)[
                            "supervisor_step2_development_potential"
                          ]
                        }
                      />
                      <ReadOnlyField
                        label="Advancement Outlook"
                        value={
                          (detail as Record<string, unknown>)[
                            "supervisor_step2_advancement_outlook"
                          ]
                        }
                      />
                    </div>
                    <ReadOnlyField
                      className="w-full"
                      label="Growth and development suggestions"
                      value={
                        (detail as Record<string, unknown>)["supervisor_step2_growth_suggestions"]
                      }
                    />
                    <div className="grid items-start gap-4 lg:grid-cols-4">
                      <ReadOnlyField
                        label="Job / Transfer Interest"
                        value={
                          transferInterestLabel(
                            (detail as Record<string, unknown>)["supervisor_step2_transfer_interest"],
                          )
                        }
                      />
                      {String(
                        (detail as Record<string, unknown>)["supervisor_step2_transfer_interest"] ??
                          "",
                      ) === "YES" ? (
                        <>
                          <ReadOnlyField
                            label="What Job?"
                            value={
                              (detail as Record<string, unknown>)["supervisor_step2_transfer_job"]
                            }
                          />
                          <ReadOnlyField
                            label="Where?"
                            value={
                              (detail as Record<string, unknown>)["supervisor_step2_transfer_where"]
                            }
                          />
                          <ReadOnlyField
                            label="Is Qualified?"
                            value={
                              (detail as Record<string, unknown>)[
                                "supervisor_step2_transfer_qualified"
                              ]
                            }
                          />
                        </>
                      ) : null}
                    </div>
                    <ReadOnlyField
                      className="w-full"
                      label="Other Comments and Recommendations"
                      value={(detail as Record<string, unknown>)["supervisor_step2_other_comments"]}
                    />
                    <ReadOnlyField
                      label="Rater Signature Date"
                      value={(detail as Record<string, unknown>)["supervisor_step2_date"]}
                    />
                  </div>
                </ReadOnlyGroup>
              </div>
              <div className="space-y-2 rounded-md border border-border p-4">
                <h3 className="font-semibold">STEP 3 - Reviewing Supervisor review (read-only)</h3>
                {(() => {
                  const accStages = (
                    detail as Record<string, unknown> & {
                      accumulatedStages?: Record<string, unknown>;
                    }
                  )?.accumulatedStages as Record<string, unknown> | undefined;
                  const revSupReview = accStages?.["reviewingSupervisorReview"] as
                    Record<string, unknown> | undefined;
                  return revSupReview ? (
                    <>
                      <div>
                        <p className="text-xs font-semibold text-muted-foreground">Comments</p>
                        <p className="whitespace-pre-wrap text-sm">
                          {String(revSupReview["comments"] ?? "-")}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs font-semibold text-muted-foreground">
                          Recommendations
                        </p>
                        <p className="whitespace-pre-wrap text-sm">
                          {String(revSupReview["recommendations"] ?? "-")}
                        </p>
                      </div>
                    </>
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      Reviewing Supervisor review not yet completed
                    </p>
                  );
                })()}
              </div>
              {stage !== "PERSONNEL" &&
                (() => {
                  const accStages = (
                    detail as Record<string, unknown> & {
                      accumulatedStages?: Record<string, unknown>;
                    }
                  )?.accumulatedStages as Record<string, unknown> | undefined;
                  const personnel = accStages?.["personnelProcessing"] as
                    Record<string, unknown> | undefined;
                  return personnel && detail.status !== "FOR_PROCESSING" ? (
                    <div className="space-y-2 rounded-md border border-border p-4">
                      <h3 className="font-semibold">Personnel Office processing (read-only)</h3>
                      <div className="grid gap-4 sm:grid-cols-2 text-sm">
                        <div>
                          <p className="text-xs font-semibold text-muted-foreground">
                            Present Salary
                          </p>
                          <p>{String(personnel["present_salary"] ?? "-")}</p>
                        </div>
                        <div>
                          <p className="text-xs font-semibold text-muted-foreground">
                            Last Increase Date
                          </p>
                          <p>{String(personnel["last_increase_date"] ?? "-")}</p>
                        </div>
                        <div>
                          <p className="text-xs font-semibold text-muted-foreground">
                            Last Increase Amount
                          </p>
                          <p>{String(personnel["last_increase_amount"] ?? "-")}</p>
                        </div>
                        <div>
                          <p className="text-xs font-semibold text-muted-foreground">
                            Total Points
                          </p>
                          <p>{String(personnel["total_points"] ?? "-")}</p>
                        </div>
                        <div className="sm:col-span-2">
                          <p className="text-xs font-semibold text-muted-foreground">
                            Nature of Last Increase
                          </p>
                          <p className="whitespace-pre-wrap">
                            {String(personnel["last_increase_nature"] ?? "-")}
                          </p>
                        </div>
                        <div>
                          <p className="text-xs font-semibold text-muted-foreground">
                            Adjective Rating
                          </p>
                          <p>{String(personnel["adjective_rating"] ?? "-")}</p>
                        </div>
                        <div>
                          <p className="text-xs font-semibold text-muted-foreground">
                            Recommended Increase / Bonus
                          </p>
                          <p className="whitespace-pre-wrap">
                            {String(personnel["recommended_increase_bonus"] ?? "-")}
                          </p>
                        </div>
                      </div>
                    </div>
                  ) : null;
                })()}
              {stage !== "COMMITTEE" &&
                (() => {
                  const accStages = (
                    detail as Record<string, unknown> & {
                      accumulatedStages?: Record<string, unknown>;
                    }
                  )?.accumulatedStages as Record<string, unknown> | undefined;
                  const committee = accStages?.["committeeReview"] as
                    Record<string, unknown> | undefined;
                  return committee && detail.status !== "FOR_REVIEW" ? (
                    <div className="space-y-2 rounded-md border border-border p-4">
                      <h3 className="font-semibold">Committee recommendation (read-only)</h3>
                      <div className="space-y-2 text-sm">
                        <div>
                          <p className="text-xs font-semibold text-muted-foreground">
                            Final Action
                          </p>
                          <p>{String(committee["final_action"] ?? "-")}</p>
                        </div>
                        <div>
                          <p className="text-xs font-semibold text-muted-foreground">
                            Action Details
                          </p>
                          <p className="whitespace-pre-wrap">
                            {String(committee["action_details"] ?? "-")}
                          </p>
                        </div>
                        <div>
                          <p className="text-xs font-semibold text-muted-foreground">
                            Committee Recommendation
                          </p>
                          <p className="whitespace-pre-wrap">
                            {String(committee["recommendation"] ?? "-")}
                          </p>
                        </div>
                      </div>
                    </div>
                  ) : null;
                })()}
            </>
          ) : null}
          <EvaluationDocumentPreview
            html={documentHtml}
            open={documentOpen}
            loading={documentOpen && !documentHtml}
            onOpenChange={(open) => {
              setDocumentOpen(open);
              if (!open) setDocumentHtml(null);
            }}
          />
          {stage === "RATER" ? (
            <>
              <div className="grid gap-4 lg:grid-cols-2">
                {field("strengths", "Strengths")}
                {field("weaknesses", "Weaknesses")}
                {field("development", "Development")}
                {field("advancement", "Advancement")}
                {field("careerTransfer", "Career / transfer")}
                {field("recommendations", "Other recommendations")}
              </div>
            </>
          ) : stage === "REVIEWING_SUPERVISOR" ? (
            <>
              {reviewAiUnavailable ? (
                <p className="text-sm text-muted-foreground">{reviewAiUnavailable}</p>
              ) : null}
              <div className="grid gap-4 lg:grid-cols-2">
                <ReviewAiField
                  label="Comments"
                  field="comments"
                  value={values.comments ?? ""}
                  suggestion={reviewAiSuggestions.comments}
                  editing={Boolean(reviewAiEditing["comments"])}
                  editable={editable}
                  onChange={(value) => update("comments", value)}
                  onSuggestionChange={(value) => editReviewSuggestion("comments", value)}
                  onToggleEdit={() =>
                    setReviewAiEditing((current) => ({
                      ...current,
                      comments: !current["comments"],
                    }))
                  }
                  onUse={() => applyReviewSuggestion("comments")}
                  onDiscard={() => discardReviewSuggestion("comments")}
                />
                <ReviewAiField
                  label="Recommendations"
                  field="recommendations"
                  value={values.recommendations ?? ""}
                  suggestion={reviewAiSuggestions.recommendations}
                  editing={Boolean(reviewAiEditing["recommendations"])}
                  editable={editable}
                  onChange={(value) => update("recommendations", value)}
                  onSuggestionChange={(value) => editReviewSuggestion("recommendations", value)}
                  onToggleEdit={() =>
                    setReviewAiEditing((current) => ({
                      ...current,
                      recommendations: !current["recommendations"],
                    }))
                  }
                  onUse={() => applyReviewSuggestion("recommendations")}
                  onDiscard={() => discardReviewSuggestion("recommendations")}
                />
              </div>
              <div className="flex items-center gap-2 text-sm">
                <span className="font-semibold text-foreground">Date &amp; Time:</span>
                <span className="text-muted-foreground">
                  {formatDateTime(values.date ?? workflowDate())}
                </span>
              </div>
            </>
          ) : stage === "PERSONNEL" ? (
            <>
              <h3 className="text-sm font-semibold">Personnel Office section - editable</h3>
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
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field
                  label="Total points (calculated)"
                  value={
                    detail.score?.finalScore === null || detail.score?.finalScore === undefined
                      ? "-"
                      : String(detail.score.finalScore)
                  }
                />
                <Field
                  label="Adjective rating (calculated)"
                  value={detail.score?.finalRatingLabel ?? "-"}
                />
              </div>
              <div className="grid gap-4 lg:grid-cols-2">
                {field("lastIncreaseNature", "Nature of last increase", false)}
                {field("recommendedIncreaseBonus", "Recommended increase / bonus")}
              </div>
            </>
          ) : stage === "COMMITTEE" ? (
            <>
              <div className="space-y-3 rounded-md border border-dashed border-primary/40 bg-primary/5 p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h3 className="text-sm font-semibold">AI Training Recommendation</h3>
                    <p className="text-xs text-muted-foreground">
                      Advisory input only. The Committee decides the official action.
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={committeeTrainingBusy || !editable}
                    onClick={generateCommitteeTrainingRecommendation}
                  >
                    {committeeTrainingBusy ? (
                      <TextShimmer>Generating...</TextShimmer>
                    ) : committeeTrainingRecommendation ? (
                      "Regenerate"
                    ) : (
                      "Generate recommendation"
                    )}
                  </Button>
                </div>
                {committeeTrainingUnavailable ? (
                  <p className="text-sm text-muted-foreground">{committeeTrainingUnavailable}</p>
                ) : null}
                {committeeTrainingRecommendation ? (
                  <div className="space-y-3 rounded-md border bg-background p-3 text-sm">
                    <p className="text-xs font-semibold uppercase tracking-wide text-primary">
                      AI-generated advisory recommendation
                    </p>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <ReadOnlyField
                        label="Recommended Training"
                        value={committeeTrainingRecommendation.recommendedTraining}
                      />
                      <ReadOnlyField
                        label="Related Competency"
                        value={committeeTrainingRecommendation.relatedCompetency}
                      />
                      <ReadOnlyField
                        label="Reason / Rationale"
                        value={committeeTrainingRecommendation.rationale}
                      />
                      <ReadOnlyField
                        label="Suggested Training Focus"
                        value={committeeTrainingRecommendation.trainingFocus}
                      />
                    </div>
                    <ReadOnlyField
                      label="Recommendation Details"
                      value={committeeTrainingRecommendation.details}
                    />
                    {committeeTrainingRecommendation.provider === "development-mock" ? (
                      <p className="text-xs text-amber-700">
                        Development mock output. This is not real AI analysis.
                      </p>
                    ) : null}
                    <div className="flex flex-wrap gap-2">
                      <Button
                        type="button"
                        size="sm"
                        disabled={!editable}
                        onClick={useCommitteeTrainingRecommendation}
                      >
                        Use in Committee fields
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={discardCommitteeTrainingRecommendation}
                      >
                        Discard
                      </Button>
                    </div>
                  </div>
                ) : null}
              </div>
              <h3 className="text-sm font-semibold">Committee recommendation - editable</h3>
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
              <div className="grid gap-4 lg:grid-cols-2">
                {field("actionDetails", "Action details", false)}
                {field("recommendations", "Committee recommendation")}
              </div>
            </>
          ) : (
            <>
              <h3 className="text-sm font-semibold">President final approval - editable</h3>
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
          {stage === "REVIEWING_SUPERVISOR" ? (
            <div className="max-w-2xl space-y-2">
              <p className="text-sm font-semibold">Signature</p>
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Signature Image
              </p>
              <SignatureField
                {...(signature ? { value: signature } : {})}
                disabled={!editable}
                onSave={persistSignature}
                onChange={setSignature}
              />
            </div>
          ) : (
            <div className="max-w-2xl">
              <SignatureField
                {...(signature ? { value: signature } : {})}
                disabled={!editable}
                onSave={persistSignature}
                onChange={setSignature}
              />
            </div>
          )}
          {stage === "PRESIDENT" ? (
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="outline" onClick={openDocument}>
                Preview Evaluation
              </Button>
              <Button type="button" variant="outline" onClick={openDocument}>
                Print / Export PDF
              </Button>
              <Button type="button" variant="secondary" onClick={openDocument}>
                Refresh PDF
              </Button>
            </div>
          ) : null}
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
