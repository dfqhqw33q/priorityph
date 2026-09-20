import {
  Stepper,
  StepperDescription,
  StepperIndicator,
  StepperItem,
  StepperNav,
  StepperSeparator,
  StepperTitle,
  StepperTrigger,
} from "@/components/reui/stepper";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDateTime } from "@/components/shared/shared-ui";
import { CheckIcon } from "lucide-react";

type WorkflowEvent = {
  id: string;
  event_type: string;
  from_status: string | null;
  to_status: string | null;
  occurred_at: string;
  actorName: string;
  reason?: string | null;
};

type WorkflowStage = {
  key: string;
  label: string;
  events: WorkflowEvent[];
};

type WorkflowStageKey =
  "EMPLOYEE" | "SUPERVISOR" | "REVIEWING_SUPERVISOR" | "HR_PERSONNEL" | "COMMITTEE" | "PRESIDENT";

const STAGE_DEFINITIONS = [
  { key: "EMPLOYEE", label: "EMPLOYEE" },
  { key: "SUPERVISOR", label: "SUPERVISOR" },
  { key: "REVIEWING_SUPERVISOR", label: "REVIEWING SUPERVISOR" },
  { key: "HR_PERSONNEL", label: "HR PERSONNEL" },
  { key: "COMMITTEE", label: "COMMITTEE" },
  { key: "PRESIDENT", label: "PRESIDENT" },
] as const satisfies ReadonlyArray<{ key: WorkflowStageKey; label: string }>;

const STAGE_EVENT_TYPES: Record<string, string[]> = {
  EMPLOYEE: ["STEP1_SUBMITTED", "EMPLOYEE_STEP1_SUBMITTED"],
  SUPERVISOR: ["RATER_STEP2_SUBMITTED"],
  REVIEWING_SUPERVISOR: ["REVIEWING_SUPERVISOR_REVIEW_STARTED", "REVIEWING_SUPERVISOR_SUBMITTED"],
  HR_PERSONNEL: ["PERSONNEL_SUBMITTED"],
  COMMITTEE: ["COMMITTEE_SUBMITTED"],
  PRESIDENT: [
    "PRESIDENT_STEP2_SUBMITTED",
    "PRESIDENT_STEP3_SUBMITTED",
    "PRESIDENT_APPROVED",
    "PRESIDENT_RETURNED",
    "FINALIZED",
    "RETURNED",
  ],
};

const EVENT_LABELS: Record<string, string> = {
  STEP1_SUBMITTED: "PERFORMANCE EVALUATION SUBMITTED",
  EMPLOYEE_STEP1_SUBMITTED: "PERFORMANCE EVALUATION SUBMITTED",
  RATER_STEP2_SUBMITTED: "PERFORMANCE EVALUATION SUBMITTED TO REVIEWING SUPERVISOR",
  REVIEWING_SUPERVISOR_REVIEW_STARTED: "PERFORMANCE EVALUATION REVIEW STARTED",
  REVIEWING_SUPERVISOR_SUBMITTED: "PERFORMANCE EVALUATION SUBMITTED TO HR PERSONNEL",
  PERSONNEL_SUBMITTED: "PERFORMANCE EVALUATION SUBMITTED TO COMMITTEE",
  COMMITTEE_SUBMITTED: "PERFORMANCE EVALUATION SUBMITTED TO PRESIDENT",
  PRESIDENT_STEP2_SUBMITTED: "PRESIDENT EVALUATION REVIEW SUBMITTED",
  PRESIDENT_STEP3_SUBMITTED: "PRESIDENT EVALUATION REVIEW COMPLETED",
  PRESIDENT_APPROVED: "PERFORMANCE EVALUATION APPROVED",
  PRESIDENT_RETURNED: "PERFORMANCE EVALUATION RETURNED",
  FINALIZED: "PERFORMANCE EVALUATION FINALIZED",
  RETURNED: "PERFORMANCE EVALUATION RETURNED",
};

function eventLabel(value: string | null | undefined) {
  return EVENT_LABELS[value ?? ""] ?? "PERFORMANCE EVALUATION UPDATED";
}

function formatActorName(fullName: string) {
  const normalized = fullName.trim();
  if (!normalized || normalized === "Unknown user" || normalized === "System") return normalized;

  const commaParts = normalized.split(",").map((part) => part.trim());
  if (commaParts.length > 1) {
    const lastName = commaParts[0] ?? "";
    const givenNames = (commaParts[1] ?? "").split(/\s+/).filter(Boolean);
    const firstName = givenNames.shift() ?? "";
    const middleInitial = givenNames[0]?.charAt(0).toUpperCase();
    return `${lastName}, ${firstName}${middleInitial ? ` ${middleInitial}.` : ""}`;
  }

  const parts = normalized.split(/\s+/).filter(Boolean);
  const firstName = parts.shift() ?? "";
  const lastName = parts.length > 0 ? parts[parts.length - 1] : firstName;
  const middleInitial = parts[0]?.charAt(0).toUpperCase();
  return `${lastName}, ${firstName}${middleInitial ? ` ${middleInitial}.` : ""}`;
}

function stageForEvent(eventType: string): WorkflowStageKey | undefined {
  for (const stage of STAGE_DEFINITIONS) {
    if (STAGE_EVENT_TYPES[stage.key]?.includes(eventType)) return stage.key;
  }
  return undefined;
}

function buildStages(events: WorkflowEvent[]): WorkflowStage[] {
  const stages = STAGE_DEFINITIONS.map((stage) => ({ ...stage, events: [] as WorkflowEvent[] }));
  const stageMap = Object.fromEntries(
    stages.map((stage) => [stage.key as WorkflowStageKey, stage]),
  ) as Record<WorkflowStageKey, WorkflowStage>;

  for (const event of events) {
    const stageKey = stageForEvent(event.event_type);
    if (!stageKey) continue;
    stageMap[stageKey].events.push(event);
  }

  return stages;
}

export function EvaluationProgressStepper({
  events,
  currentStatus,
  employeeName,
}: {
  events: WorkflowEvent[];
  currentStatus: string;
  employeeName: string;
}) {
  const stages = buildStages(
    [...events]
      .filter((event) => event.event_type !== "RATER_STEP2_DRAFT_SAVED")
      .sort((left, right) => left.occurred_at.localeCompare(right.occurred_at))
      .map((event) => ({
        ...event,
        actorName: formatActorName(
          stageForEvent(event.event_type) === "EMPLOYEE" &&
            (event.actorName === "System" || event.actorName === "Unknown user")
            ? employeeName
            : event.actorName,
        ),
      })),
  );
  const completedStageCount = stages.filter((stage) => stage.events.length > 0).length;
  const currentStage =
    currentStatus === "FOR_APPROVAL" ||
    currentStatus === "RETURNED" ||
    currentStatus === "FINALIZED"
      ? "PRESIDENT"
      : "";

  const activeStep = Math.max(
    1,
    stages.reduce((last, stage, index) => (stage.events.length > 0 ? index + 1 : last), 1),
  );

  return (
    <Card className="flex h-full min-h-0 flex-col overflow-hidden border border-border bg-card shadow-sm">
      <CardHeader className="shrink-0 pb-2">
        <CardTitle className="text-base">Evaluation Progress / Activity</CardTitle>
        <p className="text-xs text-muted-foreground">
          {completedStageCount} of {stages.length} workflow stages recorded
        </p>
      </CardHeader>
      <CardContent className="min-h-0 flex-1 overflow-y-auto p-3 pt-0 pr-3">
        <Stepper
          value={activeStep}
          orientation="vertical"
          className="flex flex-col items-stretch"
          indicators={{ completed: <CheckIcon className="size-3.5" /> }}
        >
          <StepperNav className="items-stretch gap-0">
            {stages.map((stage, index) => {
              const completed = stage.events.length > 0;
              return (
                <StepperItem
                  key={stage.key}
                  step={index + 1}
                  completed={completed}
                  className="relative items-start not-last:flex-1"
                >
                  <StepperTrigger className="items-start gap-2.5 pb-3 last:pb-0">
                    <StepperIndicator className="data-[state=completed]:bg-primary data-[state=completed]:text-primary-foreground">
                      {index + 1}
                    </StepperIndicator>
                    <div className="mt-0.5 min-w-0 space-y-1 text-left">
                      <StepperTitle className="leading-tight">
                        {stage.label}
                        {stage.key === currentStage ? " - CURRENT" : ""}
                      </StepperTitle>
                      {stage.events.length === 0 ? (
                        <StepperDescription className="text-[11px] leading-tight">
                          Pending
                        </StepperDescription>
                      ) : (
                        stage.events.map((event) => (
                          <div
                            key={event.id}
                            className="rounded-md border border-border/70 bg-muted/20 px-2 py-1.5"
                          >
                            <p className="break-words text-[11px] font-semibold text-foreground leading-snug">
                              {eventLabel(event.event_type)}
                            </p>
                            <p className="mt-0.5 break-words text-[11px] text-muted-foreground">
                              {event.actorName}
                            </p>
                            <p className="mt-0.5 text-[10px] text-muted-foreground">
                              {formatDateTime(event.occurred_at)}
                            </p>
                            {event.reason ? (
                              <p className="mt-1 break-words text-[10px] text-muted-foreground leading-snug">
                                {event.reason}
                              </p>
                            ) : null}
                          </div>
                        ))
                      )}
                    </div>
                  </StepperTrigger>
                  {index < stages.length - 1 ? (
                    <StepperSeparator className="group-data-[state=completed]/step:bg-primary absolute inset-y-0 top-6 left-3 -order-1 m-0 -translate-x-1/2 group-data-[orientation=vertical]/stepper-nav:h-[calc(100%-1rem)]" />
                  ) : null}
                </StepperItem>
              );
            })}
          </StepperNav>
        </Stepper>
      </CardContent>
    </Card>
  );
}
