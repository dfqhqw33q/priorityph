import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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
  formatDateTime,
} from "@/components/shared/shared-ui";
import {
  EvaluationRatingCards,
  ratingFor,
} from "@/features/performance-management/components/rating-matrix";
import { EvaluationProgressStepper } from "@/features/performance-management/components/evaluation-progress-stepper";
import { useAccess } from "@/hooks/use-access";
import { getEvaluation } from "@/lib/evaluations.functions";
import { saveEvaluationSignature, saveRaterStep2 } from "@/lib/evaluation-workflow.functions";
import { getEvaluationHistory } from "@/lib/reports.functions";
import { recordRaterAiAction, suggestRaterFields } from "@/lib/ai.functions";
import { SignatureField } from "@/features/performance-management/components/signature-field";
import { TextShimmer } from "@/components/loading-ui/text-shimmer";
import { userErrorMessage } from "@/lib/validation";

export const Route = createFileRoute("/_authenticated/supervisor/evaluations/$evaluationId")({
  head: () => ({
    meta: [
      { title: "Evaluation Review | Priority Handling Logistics, Inc." },
      {
        name: "description",
        content:
          "Review an employee evaluation, rate all ten factors, and submit it for the next stage.",
      },
      { property: "og:title", content: "Evaluation Review" },
      {
        property: "og:description",
        content: "Rate performance factors A-J and submit the evaluation.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: SupervisorReviewPage,
});

type Step2State = {
  [key: string]: string | undefined;
  overallExplanation?: string;
  strengths?: string;
  weaknesses?: string;
  effectiveness?: string;
  developmentPotential?: string;
  advancementOutlook?: string;
  growthSuggestions?: string;
  transferInterest?: string;
  transferJob?: string;
  transferWhere?: string;
  transferQualified?: string;
  otherComments?: string;
  date?: string;
};
type Step2Props = {
  field: string;
  label: string;
  step2: Step2State;
  setStep2: React.Dispatch<React.SetStateAction<Step2State>>;
  editable: boolean;
  canEdit: boolean;
  setDirty: (dirty: boolean) => void;
  ai?: { suggestion: string; provider: "openrouter" | "development-mock" } | undefined;
  onEdit?: (value: string) => void;
  editing?: boolean;
  onToggleEdit?: () => void;
  onUse?: () => void;
  onDiscard?: () => void;
  aiUnavailable?: string;
};

function Step2Textarea({ field, label, step2, setStep2, editable, canEdit, setDirty }: Step2Props) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={`step2-${field}`}>{label}</Label>
      <Textarea
        id={`step2-${field}`}
        rows={field === "growthSuggestions" ? 2 : 3}
        value={step2[field] ?? ""}
        disabled={!editable || !canEdit}
        onChange={(event) => {
          setStep2((current) => ({ ...current, [field]: event.target.value }));
          setDirty(true);
        }}
      />
    </div>
  );
}

function RaterAiField(props: Step2Props) {
  return (
    <div className="space-y-2">
      <Step2Textarea {...props} />
      {props.aiUnavailable ? (
        <p className="text-xs text-muted-foreground">{props.aiUnavailable}</p>
      ) : props.ai ? (
        <div className="rounded-md border border-dashed border-primary/40 bg-primary/5 p-3">
          <>
            <p className="text-xs font-semibold uppercase tracking-wide text-primary">
              AI suggestion
            </p>
            <Textarea
              className="mt-2 bg-background"
              rows={3}
              value={props.ai.suggestion}
              readOnly={!props.editing || !props.editable || !props.canEdit}
              onChange={(event) => props.onEdit?.(event.target.value)}
              aria-label={`${props.label} AI suggestion`}
            />
            {props.ai.provider === "development-mock" ? (
              <p className="mt-1 text-xs text-amber-700">
                Development mock output. This is not real AI analysis.
              </p>
            ) : null}
            <div className="mt-2 flex gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={!props.editable || !props.canEdit}
                onClick={props.onToggleEdit}
              >
                {props.editing ? "Done" : "Edit"}
              </Button>
              <Button
                type="button"
                size="sm"
                disabled={!props.editable || !props.canEdit}
                onClick={props.onUse}
              >
                Use suggestion
              </Button>
              <Button type="button" variant="ghost" size="sm" onClick={props.onDiscard}>
                Discard
              </Button>
            </div>
          </>
        </div>
      ) : null}
    </div>
  );
}

function RecommendationPanel({
  label,
  recommendation,
  editable,
  onApply,
  onDismiss,
}: {
  label: string;
  recommendation: { recommendedOption: string; reason: string } | null;
  editable: boolean;
  onApply: () => void;
  onDismiss: () => void;
}) {
  if (!recommendation) return null;
  return (
    <div className="rounded-md border border-dashed border-primary/40 bg-primary/5 p-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-primary">
        AI recommendation: {label}
      </p>
      <p className="mt-2 text-sm">
        <span className="font-semibold">Recommended:</span> {recommendation.recommendedOption}
      </p>
      <p className="mt-1 text-sm">
        <span className="font-semibold">Reason:</span> {recommendation.reason}
      </p>
      <div className="mt-2 flex gap-2">
        <Button type="button" size="sm" disabled={!editable} onClick={onApply}>
          Apply Recommendation
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={onDismiss}>
          Dismiss
        </Button>
      </div>
    </div>
  );
}

function Step2Input(props: Step2Props) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={`step2-${props.field}`}>{props.label}</Label>
      <input
        id={`step2-${props.field}`}
        className="h-10 w-full rounded-md border border-input bg-background px-3"
        value={props.step2[props.field] ?? ""}
        disabled={!props.editable || !props.canEdit}
        onChange={(event) => {
          props.setStep2((current) => ({ ...current, [props.field]: event.target.value }));
          props.setDirty(true);
        }}
      />
    </div>
  );
}

function formatDisplayValue(value: string) {
  if (!value) return value;
  return value.replace(/_/g, " ");
}

function Step2Choice({
  field,
  label,
  options,
  compactOptions = false,
  ...props
}: Step2Props & { options: string[]; compactOptions?: boolean }) {
  return (
    <fieldset className="space-y-2">
      <legend className="text-sm font-medium">{label}</legend>
      <div
        className={
          compactOptions
            ? field === "transferInterest"
              ? "grid grid-cols-1 gap-2 sm:grid-cols-3"
              : "grid grid-cols-1 gap-2 lg:grid-cols-2"
            : "space-y-2"
        }
      >
        {options.map((option) => (
          <label key={option} className="flex items-start gap-2 text-sm leading-5">
            <input
              type="radio"
              name={`step2-${field}`}
              value={option}
              checked={props.step2[field] === option}
              disabled={!props.editable || !props.canEdit}
              className="mt-1 shrink-0"
              onChange={() => {
                props.setStep2((current) => ({ ...current, [field]: option }));
                props.setDirty(true);
              }}
            />
            <span>{formatDisplayValue(option)}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

export function SupervisorReviewPage({
  evaluationId: evaluationIdOverride,
}: {
  evaluationId?: string;
}) {
  if (evaluationIdOverride) {
    return <SupervisorReviewPageInner evaluationId={evaluationIdOverride} />;
  }

  return <SupervisorReviewPageFromRoute />;
}

function SupervisorReviewPageFromRoute() {
  const { evaluationId } = Route.useParams();
  return <SupervisorReviewPageInner evaluationId={evaluationId} />;
}

function SupervisorReviewPageInner({ evaluationId }: { evaluationId?: string }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { can } = useAccess();
  const fetchEvaluation = useServerFn(getEvaluation);
  const fetchHistory = useServerFn(getEvaluationHistory);
  const submitStep2 = useServerFn(saveRaterStep2);
  const saveSignature = useServerFn(saveEvaluationSignature);
  const getRaterSuggestions = useServerFn(suggestRaterFields);
  const recordRaterAction = useServerFn(recordRaterAiAction);
  const [ratings, setRatings] = useState<Record<string, number | null>>({});
  const [remarks, setRemarks] = useState("");
  const [step2, setStep2] = useState<Step2State>({
    overallExplanation: "",
    strengths: "",
    weaknesses: "",
    effectiveness: "",
    developmentPotential: "",
    advancementOutlook: "",
    growthSuggestions: "",
    transferInterest: "",
    transferJob: "",
    transferWhere: "",
    transferQualified: "",
    otherComments: "",
    date: "",
  });
  const [signature, setSignature] = useState<
    { method: "DRAWN" | "UPLOAD"; data: string } | undefined
  >();
  const [errors, setErrors] = useState<string[]>([]);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [aiSuggestions, setAiSuggestions] = useState<
    Record<string, { suggestion: string; provider: "openrouter" | "development-mock" }>
  >({});
  const [aiBusy, setAiBusy] = useState(false);
  const [aiUnavailable, setAiUnavailable] = useState("");
  const [aiEditing, setAiEditing] = useState<Record<string, boolean>>({});
  const [aiRecommendations, setAiRecommendations] = useState<{
    developmentPotential: { recommendedOption: string; reason: string } | null;
    advancementOutlook: { recommendedOption: string; reason: string } | null;
  }>({ developmentPotential: null, advancementOutlook: null });
  const query = useQuery({
    queryKey: ["evaluation", evaluationId],
    queryFn: () => fetchEvaluation({ data: { evaluationId } }),
    retry: false,
  });
  const historyQuery = useQuery({
    queryKey: ["evaluation-progress", evaluationId],
    queryFn: () => fetchHistory({ data: { evaluationId } }),
    enabled: evaluationId !== undefined,
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
    const transferInterestValue = String(source["supervisor_step2_transfer_interest"] ?? "");
    setStep2({
      overallExplanation: source["supervisor_step2_overall_explanation"] ?? "",
      strengths: source["supervisor_step2_strengths"] ?? "",
      weaknesses: source["supervisor_step2_weaknesses"] ?? "",
      effectiveness: source["supervisor_step2_effectiveness"] ?? "",
      developmentPotential: source["supervisor_step2_development_potential"] ?? "",
      advancementOutlook: source["supervisor_step2_advancement_outlook"] ?? "",
      growthSuggestions: source["supervisor_step2_growth_suggestions"] ?? "",
      transferInterest:
        transferInterestValue === "not_aware" ||
        transferInterestValue === "NOT AWARE" ||
        transferInterestValue === "NOT_AWARE"
          ? "NOT_AWARE"
          : transferInterestValue,
      transferJob: source["supervisor_step2_transfer_job"] ?? "",
      transferWhere: source["supervisor_step2_transfer_where"] ?? "",
      transferQualified: source["supervisor_step2_transfer_qualified"] ?? "",
      otherComments: source["supervisor_step2_other_comments"] ?? "",
      date: source["supervisor_step2_date"] ?? "",
    });
    const savedSignature = source["rater_signature"] as {
      method: "DRAWN" | "UPLOAD";
      signature_data: string | null;
    } | null;
    if (savedSignature?.signature_data)
      setSignature({ method: savedSignature.method, data: savedSignature.signature_data });
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

  const editable = detail?.status === "SUBMITTED" || detail?.status === "DRAFT";
  const currentDate = new Date().toISOString();

  const ratingPayload = () =>
    Object.entries(ratings)
      .filter(([, value]) => typeof value === "number")
      .map(([criterionId, value]) => ({ criterionId, rating: value as number }));

  async function persistSignature() {
    if (!detail || !signature) return;
    await saveSignature({
      data: { evaluationId, version: detail.version, stage: "RATER_STEP2", signature },
    });
    await queryClient.invalidateQueries({ queryKey: ["evaluation", evaluationId] });
  }

  async function generateSuggestions() {
    if (!detail) return;
    setAiBusy(true);
    setAiUnavailable("");
    try {
      const result = await getRaterSuggestions({
        data: {
          evaluationId,
          version: detail.version,
          supervisorRatings: Object.entries(ratings)
            .filter(([, rating]) => typeof rating === "number")
            .map(([criterionId, rating]) => ({ criterionId, rating: rating as number })),
          currentValues: {
            overallExplanation: step2["overallExplanation"] ?? "",
            strengths: step2["strengths"] ?? "",
            weaknesses: step2["weaknesses"] ?? "",
            effectiveness: step2["effectiveness"] ?? "",
            developmentPotential: step2["developmentPotential"] ?? "",
            advancementOutlook: step2["advancementOutlook"] ?? "",
            growthSuggestions: step2["growthSuggestions"] ?? "",
            transferInterest: step2["transferInterest"] ?? "",
            transferJob: step2["transferJob"] ?? "",
            transferWhere: step2["transferWhere"] ?? "",
            transferQualified: step2["transferQualified"] ?? "",
            otherComments: step2["otherComments"] ?? "",
          },
          actionId: crypto.randomUUID(),
          regenerate: Object.keys(aiSuggestions).length > 0,
        },
      });
      setAiSuggestions({
        ...(result.q1Explanation
          ? { overallExplanation: { suggestion: result.q1Explanation, provider: result.provider } }
          : {}),
        ...Object.fromEntries(
          Object.entries(result.suggestions).map(([field, suggestion]) => [
            field,
            { suggestion, provider: result.provider },
          ]),
        ),
      });
      setAiRecommendations({
        developmentPotential: result.developmentPotential,
        advancementOutlook: result.advancementOutlook,
      });
      setAiEditing({});
    } catch (error) {
      const message = userErrorMessage(
        error,
        "AI assistance unavailable. You can complete these fields manually.",
      );
      setAiUnavailable(message);
      toast.error(message);
    } finally {
      setAiBusy(false);
    }
  }

  function applySuggestion(field: string) {
    const suggestion = aiSuggestions[field];
    if (!suggestion) return;
    setStep2((current) => ({ ...current, [field]: suggestion.suggestion }));
    setDirty(true);
    void recordRaterAction({
      data: {
        evaluationId,
        version: detail?.version ?? 1,
        field: field as
          | "overallExplanation"
          | "strengths"
          | "weaknesses"
          | "effectiveness"
          | "developmentPotential"
          | "advancementOutlook"
          | "growthSuggestions"
          | "otherComments",
        action: "ACCEPTED",
        actionId: crypto.randomUUID(),
        edited: Boolean(aiEditing[field]),
      },
    }).catch(() => undefined);
    setAiSuggestions((current) => {
      const next = { ...current };
      delete next[field];
      return next;
    });
    setAiEditing((current) => {
      const next = { ...current };
      delete next[field];
      return next;
    });
  }

  function editSuggestion(field: string, value: string) {
    setAiSuggestions((current) => ({
      ...current,
      [field]: {
        ...(current[field] ?? { suggestion: "", provider: "development-mock" as const }),
        suggestion: value,
      },
    }));
  }

  function applyRecommendation(field: "developmentPotential" | "advancementOutlook") {
    const recommendation = aiRecommendations[field];
    if (!recommendation) return;
    setStep2((current) => ({ ...current, [field]: recommendation.recommendedOption }));
    setDirty(true);
    void recordRaterAction({
      data: {
        evaluationId,
        version: detail?.version ?? 1,
        field,
        action: "ACCEPTED",
        actionId: crypto.randomUUID(),
        edited: false,
      },
    }).catch(() => undefined);
    setAiRecommendations((current) => ({ ...current, [field]: null }));
  }

  function discardRecommendation(field: "developmentPotential" | "advancementOutlook") {
    void recordRaterAction({
      data: {
        evaluationId,
        version: detail?.version ?? 1,
        field,
        action: "DISMISSED",
        actionId: crypto.randomUUID(),
        edited: false,
      },
    }).catch(() => undefined);
    setAiRecommendations((current) => ({ ...current, [field]: null }));
  }

  function toggleSuggestionEdit(field: string) {
    setAiEditing((current) => ({ ...current, [field]: !current[field] }));
  }

  function discardSuggestion(field: string) {
    void recordRaterAction({
      data: {
        evaluationId,
        version: detail?.version ?? 1,
        field: field as
          | "overallExplanation"
          | "strengths"
          | "weaknesses"
          | "effectiveness"
          | "developmentPotential"
          | "advancementOutlook"
          | "growthSuggestions"
          | "otherComments",
        action: "DISMISSED",
        actionId: crypto.randomUUID(),
        edited: false,
      },
    }).catch(() => undefined);
    setAiSuggestions((current) => {
      const next = { ...current };
      delete next[field];
      return next;
    });
    setAiEditing((current) => {
      const next = { ...current };
      delete next[field];
      return next;
    });
  }

  const draftMutation = useMutation({
    mutationFn: () =>
      submitStep2({
        data: {
          evaluationId,
          version: detail?.version ?? 1,
          ratings: ratingPayload(),
          remarks,
          ...step2,
          submit: false,
        },
      }),
    onSuccess: async () => {
      toast.success("Draft saved");
      setDirty(false);
      await queryClient.invalidateQueries({ queryKey: ["evaluation", evaluationId] });
    },
    onError: (error: Error) => toast.error(userErrorMessage(error, "Draft could not be saved")),
  });

  const submitMutation = useMutation({
    mutationFn: async () => {
      return submitStep2({
        data: {
          evaluationId,
          version: detail?.version ?? 1,
          ratings: ratingPayload(),
          remarks,
          ...step2,
          date: step2["date"] || currentDate,
          submit: true,
          signature,
        },
      });
    },
    onSuccess: async () => {
      toast.success("Step 2 submitted for Reviewing Supervisor review");
      setDirty(false);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["evaluation", evaluationId] }),
        queryClient.invalidateQueries({ queryKey: ["supervisor-queue"] }),
        queryClient.invalidateQueries({ queryKey: ["supervisor-stats"] }),
        queryClient.invalidateQueries({ queryKey: ["reviewing-supervisor-stats"] }),
        queryClient.invalidateQueries({ queryKey: ["committee-stats"] }),
        queryClient.invalidateQueries({ queryKey: ["president-stats"] }),
        queryClient.invalidateQueries({ queryKey: ["hr-stats"] }),
        queryClient.invalidateQueries({ queryKey: ["admin-stats"] }),
      ]);
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

  if (query.isLoading) return <LoadingBlock rows={6} variant="detail" />;
  if (query.isError) {
    const message = query.error instanceof Error ? query.error.message : "Unavailable";
    return <EmptyState title="Unable to open this evaluation" description={message} />;
  }
  if (!detail)
    return <EmptyState title="Evaluation not found" description="It may have been removed." />;

  return (
    <div className="space-y-6">
      <h2 className="text-sm font-semibold uppercase">EMPLOYEE PROFILE INFORMATION</h2>
      <div className="max-w-full border border-border bg-card shadow-sm">
        <Table>
          <caption className="sr-only">Employee information</caption>
          <TableHeader>
            <TableRow>
              <TableHead className="min-w-[120px] whitespace-nowrap bg-primary text-primary-foreground">
                Employee ID
              </TableHead>
              <TableHead className="min-w-[190px] bg-primary text-primary-foreground">
                Full Name
              </TableHead>
              <TableHead className="min-w-[150px] bg-primary text-primary-foreground">
                Job Title
              </TableHead>
              <TableHead className="min-w-[170px] bg-primary text-primary-foreground">
                Division / Department
              </TableHead>
              <TableHead className="min-w-[150px] bg-primary text-primary-foreground">
                Section / Unit
              </TableHead>
              <TableHead className="min-w-[240px] bg-primary text-primary-foreground">
                Cycle
              </TableHead>
              <TableHead className="min-w-[190px] whitespace-nowrap bg-primary text-primary-foreground">
                Date Submitted
              </TableHead>
              <TableHead className="min-w-[120px] whitespace-nowrap bg-primary text-primary-foreground">
                Status
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <TableRow>
              <TableCell className="whitespace-nowrap tabular-nums">
                {detail.employee_number_snapshot}
              </TableCell>
              <TableCell className="font-medium">{detail.full_name_snapshot}</TableCell>
              <TableCell className="text-muted-foreground">
                {detail.job_title_snapshot || "—"}
              </TableCell>
              <TableCell className="text-muted-foreground">
                {detail.division_snapshot || "—"}
              </TableCell>
              <TableCell className="text-muted-foreground">
                {detail.section_snapshot || "—"}
              </TableCell>
              <TableCell className="text-foreground">
                {detail.cycle_name} ({detail.cycle_year})
              </TableCell>
              <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                {formatDateTime(detail.employee_submitted_at)}
              </TableCell>
              <TableCell className="whitespace-nowrap">
                <EvaluationStatusBadge status={detail.status} />
              </TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Performance factors</CardTitle>
          <CardDescription>
            Employee ratings are shown for reference. Rate each factor from 1 (poor) to 5
            (excellent).
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
        <CardHeader className="flex flex-row items-start justify-between gap-4">
          <div>
            <CardTitle className="text-base">STEP TWO: Conclusions and Comments</CardTitle>
            <CardDescription>(CONFIDENTIAL: NOT TO BE SHOWN TO RATEE)</CardDescription>
          </div>
          <div className="flex shrink-0 flex-col items-end gap-1 text-right">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={aiBusy || !editable || !can("evaluations.step2")}
              onClick={generateSuggestions}
            >
              {aiBusy ? <TextShimmer>Generating...</TextShimmer> : "AI Suggestions"}
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-5">
          {aiUnavailable ? <p className="text-sm text-muted-foreground">{aiUnavailable}</p> : null}
          <section className="space-y-4">
            <h3 className="text-sm font-semibold uppercase tracking-tight">
              PERFORMANCE CONCLUSIONS
            </h3>
            <RaterAiField
              label="1. If the overall rating is excellent or poor, explain why the employee was rated such or support rating with specific incidents."
              field="overallExplanation"
              step2={step2}
              setStep2={setStep2}
              editable={editable}
              canEdit={can("evaluations.step2")}
              setDirty={setDirty}
              ai={aiSuggestions["overallExplanation"]}
              onEdit={(value) => editSuggestion("overallExplanation", value)}
              editing={Boolean(aiEditing["overallExplanation"])}
              onToggleEdit={() => toggleSuggestionEdit("overallExplanation")}
              onUse={() => applySuggestion("overallExplanation")}
              onDiscard={() => discardSuggestion("overallExplanation")}
            />
            <p className="text-sm font-medium">
              2. Summarize the principal strengths and weakness of the employee.
            </p>
            <div className="grid gap-4 sm:grid-cols-2">
              <RaterAiField
                label="Principal Strengths"
                field="strengths"
                step2={step2}
                setStep2={setStep2}
                editable={editable}
                canEdit={can("evaluations.step2")}
                setDirty={setDirty}
                ai={aiSuggestions["strengths"]}
                onEdit={(value) => editSuggestion("strengths", value)}
                editing={Boolean(aiEditing["strengths"])}
                onToggleEdit={() => toggleSuggestionEdit("strengths")}
                onUse={() => applySuggestion("strengths")}
                onDiscard={() => discardSuggestion("strengths")}
              />
              <RaterAiField
                label="Principal Weakness"
                field="weaknesses"
                step2={step2}
                setStep2={setStep2}
                editable={editable}
                canEdit={can("evaluations.step2")}
                setDirty={setDirty}
                ai={aiSuggestions["weaknesses"]}
                onEdit={(value) => editSuggestion("weaknesses", value)}
                editing={Boolean(aiEditing["weaknesses"])}
                onToggleEdit={() => toggleSuggestionEdit("weaknesses")}
                onUse={() => applySuggestion("weaknesses")}
                onDiscard={() => discardSuggestion("weaknesses")}
              />
            </div>
            <RaterAiField
              label="To be more effective on present job the employee should:"
              field="effectiveness"
              step2={step2}
              setStep2={setStep2}
              editable={editable}
              canEdit={can("evaluations.step2")}
              setDirty={setDirty}
              ai={aiSuggestions["effectiveness"]}
              onEdit={(value) => editSuggestion("effectiveness", value)}
              editing={Boolean(aiEditing["effectiveness"])}
              onToggleEdit={() => toggleSuggestionEdit("effectiveness")}
              onUse={() => applySuggestion("effectiveness")}
              onDiscard={() => discardSuggestion("effectiveness")}
            />
          </section>
          <section className="space-y-4 border-t border-border/60 pt-4">
            <h3 className="text-sm font-semibold uppercase tracking-tight">
              DEVELOPMENT AND CAREER
            </h3>
            <div className="grid gap-5 lg:grid-cols-2">
              <Step2Choice
                label="3. The employee's development potential on present job is:"
                field="developmentPotential"
                options={[
                  "Very marked growth expected on present job",
                  "Considerable improvement expected on present job",
                  "Only moderate improvement ahead on present job",
                  "Likely to maintain present performance level on present job",
                  "Likely to become less effective on present job",
                ]}
                step2={step2}
                setStep2={setStep2}
                editable={editable}
                canEdit={can("evaluations.step2")}
                setDirty={setDirty}
              />
              <Step2Choice
                label="4. The employee's advancement outlook is:"
                field="advancementOutlook"
                options={[
                  "Promising. Should be able to advance to jobs several levels beyond his present one.",
                  "Fairly promising. Should be able to advance to a job in the next higher level.",
                  "Present job or jobs within the same grade level represent his advancement.",
                  "Employee has difficulty in advancing to his job ceiling.",
                  "Employee should be transferred. Not suited to this job; would fit better in some other job.",
                ]}
                step2={step2}
                setStep2={setStep2}
                editable={editable}
                canEdit={can("evaluations.step2")}
                setDirty={setDirty}
              />
            </div>
            <div className="grid gap-4 lg:grid-cols-2">
              <RecommendationPanel
                label="Development Potential"
                recommendation={aiRecommendations.developmentPotential}
                editable={editable && can("evaluations.step2")}
                onApply={() => applyRecommendation("developmentPotential")}
                onDismiss={() => discardRecommendation("developmentPotential")}
              />
              <RecommendationPanel
                label="Advancement Outlook"
                recommendation={aiRecommendations.advancementOutlook}
                editable={editable && can("evaluations.step2")}
                onApply={() => applyRecommendation("advancementOutlook")}
                onDismiss={() => discardRecommendation("advancementOutlook")}
              />
            </div>
            <RaterAiField
              label="5. Suggest ways to accelerate employee's growth and development."
              field="growthSuggestions"
              step2={step2}
              setStep2={setStep2}
              editable={editable}
              canEdit={can("evaluations.step2")}
              setDirty={setDirty}
              ai={aiSuggestions["growthSuggestions"]}
              onEdit={(value) => editSuggestion("growthSuggestions", value)}
              editing={Boolean(aiEditing["growthSuggestions"])}
              onToggleEdit={() => toggleSuggestionEdit("growthSuggestions")}
              onUse={() => applySuggestion("growthSuggestions")}
              onDiscard={() => discardSuggestion("growthSuggestions")}
            />
          </section>
          <section className="space-y-4 border-t border-border/60 pt-4">
            <h3 className="text-sm font-semibold uppercase tracking-tight">JOB / TRANSFER</h3>
            <Step2Choice
              label="6. Has the employee expressed any interest in assuming another job or transferring to another company / division / department / section?"
              field="transferInterest"
              options={["YES", "NO", "NOT_AWARE"]}
              step2={step2}
              setStep2={setStep2}
              editable={editable}
              canEdit={can("evaluations.step2")}
              setDirty={setDirty}
              compactOptions
            />
            {step2["transferInterest"] === "YES" ? (
              <div className="grid gap-4 sm:grid-cols-3">
                <Step2Input
                  label="What job?"
                  field="transferJob"
                  step2={step2}
                  setStep2={setStep2}
                  editable={editable}
                  canEdit={can("evaluations.step2")}
                  setDirty={setDirty}
                />
                <Step2Input
                  label="Where?"
                  field="transferWhere"
                  step2={step2}
                  setStep2={setStep2}
                  editable={editable}
                  canEdit={can("evaluations.step2")}
                  setDirty={setDirty}
                />
                <Step2Input
                  label="Is he qualified?"
                  field="transferQualified"
                  step2={step2}
                  setStep2={setStep2}
                  editable={editable}
                  canEdit={can("evaluations.step2")}
                  setDirty={setDirty}
                />
              </div>
            ) : null}
          </section>
          <div className="space-y-4 border-t border-border/60 pt-4">
            <section className="min-w-0 space-y-4">
              <h3 className="text-sm font-semibold uppercase tracking-tight">OTHER COMMENTS</h3>
              <RaterAiField
                label="7. Other comments and recommendations"
                field="otherComments"
                step2={step2}
                setStep2={setStep2}
                editable={editable}
                canEdit={can("evaluations.step2")}
                setDirty={setDirty}
                ai={aiSuggestions["otherComments"]}
                onEdit={(value) => editSuggestion("otherComments", value)}
                editing={Boolean(aiEditing["otherComments"])}
                onToggleEdit={() => toggleSuggestionEdit("otherComments")}
                onUse={() => applySuggestion("otherComments")}
                onDiscard={() => discardSuggestion("otherComments")}
              />
            </section>

            <div className="grid items-stretch gap-4 lg:grid-cols-2">
              <section className="min-w-0 space-y-4">
                <h3 className="text-sm font-semibold uppercase tracking-tight">SIGNATURE</h3>
                <div className="space-y-1.5">
                  <SignatureField
                    {...(signature ? { value: signature } : {})}
                    compact
                    disabled={!editable}
                    onSave={persistSignature}
                    onChange={(value) => {
                      setSignature(value);
                      setDirty(true);
                    }}
                  />
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <span className="font-semibold text-foreground">Date &amp; Time:</span>
                  <span className="text-muted-foreground">
                    {formatDateTime(step2["date"] || currentDate)}
                  </span>
                </div>
              </section>

              <EvaluationProgressStepper
                events={historyQuery.data?.events ?? []}
                currentStatus={detail?.status ?? "DRAFT"}
                employeeName={detail?.full_name_snapshot ?? "Employee"}
              />
            </div>
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
            {draftMutation.isPending ? "Saving..." : "Save draft"}
          </Button>
        ) : null}
        {editable && can("evaluations.step2") ? (
          <Button onClick={handleSubmitClick} disabled={submitMutation.isPending}>
            {submitMutation.isPending ? "Submitting..." : "Submit for Reviewing Supervisor"}
          </Button>
        ) : null}
        <Button variant="ghost" onClick={() => navigate({ to: "/supervisor/evaluations" })}>
          Back to queue
        </Button>
      </div>

      {!editable ? (
        <p className="text-sm text-muted-foreground">
          This assessment is locked because it has already been submitted to the Reviewing
          Supervisor.
        </p>
      ) : null}

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Submit to the Reviewing Supervisor?</AlertDialogTitle>
            <AlertDialogDescription>
              Your ratings and remarks will be locked and forwarded to the Reviewing Supervisor.
              This action is recorded in the audit trail.
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
      <p className="mt-0.5 font-medium text-foreground">{value || "-"}</p>
    </div>
  );
}
