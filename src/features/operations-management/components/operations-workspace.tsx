import { useMemo, useState, type FormEvent, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { z } from "zod";

import {
  EmptyState,
  ErrorState,
  LoadingState,
  PageHeader,
  StatusBadge,
  SummaryCard,
} from "@/components/shared/portal-ui";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  acceptAiRecommendation,
  assignLearningCourse,
  createDevelopmentPlan,
  createLearningCourse,
  createLearningPath,
  createLearningQuiz,
  createTrainingSession,
  decideDevelopmentPlan,
  getOperationsWorkspace,
  linkVerifiedPlanReassessment,
  publishLearningQuiz,
  publishLearningPath,
  reviewAiRecommendation,
  reviewLearningCourse,
  submitDevelopmentPlan,
  submitLearningCourseForReview,
  updateTrainingAttendance,
  type OperationsWorkspaceData,
} from "@/lib/operations-learning.functions";

type ModuleKey =
  | "competencies"
  | "recommendations"
  | "development-plans"
  | "courses"
  | "learning-paths"
  | "quizzes"
  | "learners"
  | "calendar"
  | "sessions"
  | "reassessments"
  | "effectiveness"
  | "reports";

const MODULES: Record<ModuleKey, { title: string; description: string }> = {
  competencies: {
    title: "Competency Gaps",
    description:
      "Prioritize development against active, approved job requirements and approved assessment evidence.",
  },
  recommendations: {
    title: "AI Recommendations",
    description:
      "Review human-reviewed, validated-gap-linked suggestions. Accepting a recommendation creates a draft plan; it never assigns learning automatically.",
  },
  "development-plans": {
    title: "Development Plans",
    description:
      "Turn an approved competency gap or reviewed recommendation into a scoped, approved development plan.",
  },
  courses: {
    title: "Course & Learning Content Management",
    description:
      "Manage versioned course records mapped to the competency framework. Publication requires an authorized content reviewer.",
  },
  "learning-paths": {
    title: "Learning Paths",
    description: "Sequence published courses into role or development journeys.",
  },
  quizzes: {
    title: "Quiz & Assessment Management",
    description:
      "Configure course knowledge checks and inspect submitted quiz attempts. Practical competency still requires reassessment evidence.",
  },
  learners: {
    title: "Learner Progress",
    description:
      "Monitor assigned course progress and quiz results for the authorized development population.",
  },
  calendar: {
    title: "Training Calendar",
    description:
      "View scheduled sessions linked to published courses or approved development plans.",
  },
  sessions: {
    title: "Training Sessions & Attendance",
    description:
      "Schedule delivery against actual courses or approved plans and record participant attendance.",
  },
  reassessments: {
    title: "Assessment & Reassessment",
    description:
      "Coordinate reassessment follow-up. Only a qualified Supervisor or assessor may submit competency evidence and results.",
  },
  effectiveness: {
    title: "Training Effectiveness",
    description:
      "Compare learning activity with validated reassessment outcomes and unresolved competency gaps.",
  },
  reports: {
    title: "Learning & Training Reports",
    description:
      "Live operational summaries derived from authorized course, assignment, attendance, plan, and competency records.",
  },
};

const fieldClass = "space-y-1.5 text-sm font-medium";
const quizQuestionSchema = z
  .array(
    z.object({
      prompt: z.string().trim().min(3),
      options: z.array(z.string().trim().min(1)).min(2).max(10),
      correctOption: z.number().int().min(0).max(9),
      points: z.number().positive(),
    }),
  )
  .min(1)
  .max(100);

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className={fieldClass}>
      <span>{label}</span>
      {children}
    </label>
  );
}

function Table({ headers, rows }: { headers: string[]; rows: Array<Array<ReactNode>> }) {
  if (!rows.length)
    return (
      <EmptyState
        title="No matching records"
        description="There are no records for this view yet. Complete the described setup or workflow step to populate it."
      />
    );
  return (
    <div className="overflow-x-auto rounded-md border">
      <table className="w-full min-w-[700px] text-left text-sm">
        <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
          <tr>
            {headers.map((header) => (
              <th key={header} className="px-3 py-2">
                {header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={index} className="border-t align-top">
              {row.map((cell, cellIndex) => (
                <td key={cellIndex} className="px-3 py-3">
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

function formatDate(value: string | null | undefined) {
  if (!value) return "Not set";
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? value : date.toLocaleString();
}

function Dashboard({
  data,
  onNavigate,
}: {
  data: OperationsWorkspaceData;
  onNavigate: (module: ModuleKey) => void;
}) {
  const pendingPlans = data.plans.filter((plan) => plan.status === "PENDING_APPROVAL");
  const activePlans = data.plans.filter((plan) => ["APPROVED", "ACTIVE"].includes(plan.status));
  const publishedCourses = data.courses.filter((course) => course.status === "PUBLISHED");
  const pendingRecommendations = data.recommendations.filter(
    (item) => item.status === "PENDING_REVIEW",
  );
  const inProgressAssignments = data.assignments.filter((item) => item.status === "IN_PROGRESS");
  const today = new Date();
  const upcomingSessions = data.sessions.filter(
    (session) => session.status === "SCHEDULED" && new Date(session.starts_at) >= today,
  );
  const attentionAttendance = data.attendance.filter((item) => {
    const session = data.sessions.find((candidate) => candidate.id === item.session_id);
    return item.status === "REGISTERED" && session && new Date(session.ends_at) < today;
  });
  const openGaps = data.gaps.filter((item) => item.status === "Gap" || item.qualificationMissing);
  const unresolved = openGaps.length;
  const resolvedPlans = data.plans.filter(
    (plan) => plan.followup_assessment_id && plan.status === "COMPLETED",
  ).length;
  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <SummaryCard
          label="Competency gaps requiring development"
          value={openGaps.length}
          description="Approved requirements compared with approved assessment evidence."
        />
        <SummaryCard
          label="AI recommendations awaiting review"
          value={pendingRecommendations.length}
          description={
            pendingRecommendations.length
              ? "Review before converting any suggestion into a plan."
              : "No pending records. Recommendations appear only after a validated AI integration creates them."
          }
        />
        <SummaryCard
          label="Development plans awaiting approval"
          value={pendingPlans.length}
          description="Submitted plans awaiting an authorized HR or Department Head decision."
        />
        <SummaryCard
          label="Active development plans"
          value={activePlans.length}
          description="Approved or active plans linked to competency gaps."
        />
        <SummaryCard
          label="Published courses"
          value={publishedCourses.length}
          description="Published, competency-mapped course versions."
        />
        <SummaryCard
          label="Learners currently in progress"
          value={inProgressAssignments.length}
          description="Assignments with an active learner progress status."
        />
        <SummaryCard
          label="Upcoming training sessions"
          value={upcomingSessions.length}
          description="Scheduled sessions not yet started."
        />
        <SummaryCard
          label="Attendance records requiring attention"
          value={attentionAttendance.length}
          description="Registered participants for sessions already ended."
        />
        <SummaryCard
          label="Reassessments due"
          value={data.reassessments.length}
          description="Due dates from approved assessments; submit results through an authorized assessor."
        />
        <SummaryCard
          label="Training effectiveness"
          value={`${resolvedPlans} verified / ${unresolved} unresolved`}
          description="Verified plans require a linked follow-up assessment; attendance alone does not close gaps."
        />
      </div>
      <div className="grid gap-4 xl:grid-cols-2">
        <Section title="Pending AI recommendation reviews">
          <Table
            headers={["Employee", "Gap", "Suggested activity", "Course", "Generated"]}
            rows={pendingRecommendations
              .slice(0, 5)
              .map((item) => [
                item.employeeName,
                item.competency,
                item.activity_title,
                item.courseTitle ?? "No mapped course",
                formatDate(item.created_at),
              ])}
          />
          {!pendingRecommendations.length ? (
            <EmptyState
              title="No recommendations awaiting review"
              description="This queue is based on actual persisted AI outputs. Gemini generation is not configured in this workspace; no synthetic recommendations are shown."
            />
          ) : null}
          <Button className="mt-3" variant="outline" onClick={() => onNavigate("recommendations")}>
            Open recommendations
          </Button>
        </Section>
        <Section title="Development plans requiring action">
          <Table
            headers={["Employee", "Plan", "Status", "Target"]}
            rows={data.plans
              .filter((plan) => ["PENDING_APPROVAL", "RETURNED", "DRAFT"].includes(plan.status))
              .slice(0, 5)
              .map((plan) => [
                plan.employeeName,
                plan.title,
                <StatusBadge>{plan.status.replaceAll("_", " ")}</StatusBadge>,
                formatDate(plan.target_date),
              ])}
          />
          <Button
            className="mt-3"
            variant="outline"
            onClick={() => onNavigate("development-plans")}
          >
            Open plans
          </Button>
        </Section>
        <Section title="Upcoming training sessions">
          <Table
            headers={["Session", "Course", "Starts", "Participants"]}
            rows={upcomingSessions
              .slice(0, 5)
              .map((session) => [
                session.title,
                session.courseTitle,
                formatDate(session.starts_at),
                session.participantCount,
              ])}
          />
          <Button className="mt-3" variant="outline" onClick={() => onNavigate("calendar")}>
            Open calendar
          </Button>
        </Section>
        <Section title="Learners needing follow-up">
          <Table
            headers={["Employee", "Course", "Progress", "Due"]}
            rows={data.assignments
              .filter(
                (item) =>
                  item.status === "OVERDUE" ||
                  (item.due_at && item.due_at < new Date().toISOString().slice(0, 10)),
              )
              .slice(0, 5)
              .map((item) => [
                item.employeeName,
                item.courseTitle,
                `${item.progress_percent}%`,
                formatDate(item.due_at),
              ])}
          />
          <Button className="mt-3" variant="outline" onClick={() => onNavigate("learners")}>
            Open learner progress
          </Button>
        </Section>
        <Section title="Reassessments due">
          <Table
            headers={["Employee", "Competency", "Current / required", "Due"]}
            rows={data.reassessments
              .slice(0, 5)
              .map((gap) => [
                gap.employeeName,
                gap.competency,
                `${gap.currentLevel ?? "Unassessed"} / ${gap.requiredLevel}`,
                formatDate(gap.nextAssessmentOn),
              ])}
          />
          <Button className="mt-3" variant="outline" onClick={() => onNavigate("reassessments")}>
            Open reassessments
          </Button>
        </Section>
        <Section title="Competency gaps requiring development">
          <Table
            headers={["Employee", "Competency", "Current / required", "Gap / qualification"]}
            rows={openGaps
              .slice(0, 5)
              .map((gap) => [
                gap.employeeName,
                gap.competency,
                `${gap.currentLevel ?? "Unassessed"} / ${gap.requiredLevel}`,
                gap.qualificationMissing
                  ? "Mandatory qualification missing"
                  : `${gap.gap} level(s)`,
              ])}
          />
          <Button className="mt-3" variant="outline" onClick={() => onNavigate("competencies")}>
            Open competency gaps
          </Button>
        </Section>
        <Section title="Recent training activity">
          <Table
            headers={["Activity", "Status", "Date"]}
            rows={[
              ...data.attendance
                .slice(0, 4)
                .map((item) => [
                  item.sessionTitle,
                  `${item.employeeName}: ${item.status}`,
                  formatDate(item.recorded_at),
                ]),
              ...data.assignments
                .slice(0, 4)
                .map((item) => [
                  item.courseTitle,
                  `${item.employeeName}: ${item.status}`,
                  formatDate(item.assigned_at),
                ]),
            ].slice(0, 5)}
          />
        </Section>
      </div>
    </>
  );
}

function useWorkspaceData() {
  return useQuery({
    queryKey: ["operations-learning-workspace"],
    queryFn: useServerFn(getOperationsWorkspace),
  });
}

export function OperationsDashboard() {
  const query = useWorkspaceData();
  const navigate = useNavigate();
  if (query.isPending) return <LoadingState label="Loading Operations Manager dashboard" />;
  if (query.error) return <ErrorState message={query.error.message} />;
  return (
    <div className="space-y-6">
      <PageHeader
        breadcrumbs={["Operations Manager", "Dashboard"]}
        title="Operations Manager Dashboard"
        description="Learning, development-plan, training delivery, attendance, and reassessment oversight from authorized operational records."
      />
      <Dashboard
        data={query.data}
        onNavigate={(module) => navigate({ to: "/operations/$module", params: { module } })}
      />
    </div>
  );
}

export function OperationsModule({ module, onBack }: { module: ModuleKey; onBack?: () => void }) {
  const queryClient = useQueryClient();
  const query = useWorkspaceData();
  const [search, setSearch] = useState("");
  const [feedback, setFeedback] = useState("");
  const createCourse = useServerFn(createLearningCourse);
  const submitCourse = useServerFn(submitLearningCourseForReview);
  const reviewCourse = useServerFn(reviewLearningCourse);
  const createPath = useServerFn(createLearningPath);
  const publishPath = useServerFn(publishLearningPath);
  const createQuiz = useServerFn(createLearningQuiz);
  const publishQuiz = useServerFn(publishLearningQuiz);
  const createPlan = useServerFn(createDevelopmentPlan);
  const submitPlan = useServerFn(submitDevelopmentPlan);
  const decidePlan = useServerFn(decideDevelopmentPlan);
  const assignCourse = useServerFn(assignLearningCourse);
  const createSession = useServerFn(createTrainingSession);
  const updateAttendance = useServerFn(updateTrainingAttendance);
  const linkReassessment = useServerFn(linkVerifiedPlanReassessment);
  const acceptRecommendation = useServerFn(acceptAiRecommendation);
  const reviewRecommendation = useServerFn(reviewAiRecommendation);
  const mutation = useMutation({
    mutationFn: (action: () => Promise<unknown>) => action(),
    onSuccess: async () => {
      toast.success("Changes saved.");
      setFeedback("");
      await queryClient.invalidateQueries({ queryKey: ["operations-learning-workspace"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });
  const run = (action: () => Promise<unknown>) => mutation.mutate(action);
  const data = query.data;
  const filtered = (value: string) =>
    value.toLocaleLowerCase().includes(search.toLocaleLowerCase());
  const gapOptions = useMemo(
    () => data?.gaps.filter((gap) => gap.assessmentId && (gap.gap ?? 0) > 0),
    [data?.gaps],
  );
  if (query.isPending) return <LoadingState label={`Loading ${MODULES[module].title}`} />;
  if (query.error) return <ErrorState message={query.error.message} />;
  const workspace = query.data;
  const title = MODULES[module].title;

  function formData(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    return new FormData(event.currentTarget);
  }
  const match = (value: string) => filtered(value);
  const employeeOptions = [...new Map(workspace.gaps.map((gap) => [gap.employeeId, gap])).values()];
  const publishedCourses = workspace.courses.filter((course) => course.status === "PUBLISHED");

  return (
    <div className="space-y-6">
      <PageHeader
        breadcrumbs={["Operations Manager", title]}
        title={title}
        description={MODULES[module].description}
        actions={
          onBack ? (
            <Button variant="outline" onClick={onBack}>
              Back to dashboard
            </Button>
          ) : undefined
        }
      />
      {module !== "courses" &&
      module !== "learning-paths" &&
      module !== "quizzes" &&
      module !== "development-plans" &&
      module !== "sessions" ? (
        <Input
          aria-label={`Filter ${title}`}
          placeholder={`Filter ${title.toLowerCase()}`}
          value={search}
          onChange={(event) => setSearch(event.currentTarget.value)}
        />
      ) : null}

      {module === "recommendations" ? (
        <Section title="Recommendations awaiting human review">
          <Table
            headers={[
              "Employee",
              "Competency gap",
              "Proposed activity",
              "Mapped resource",
              "Rationale / verification",
              "Decision",
            ]}
            rows={workspace.recommendations
              .filter(
                (item) =>
                  item.status === "PENDING_REVIEW" &&
                  match(
                    `${item.employeeName} ${item.competency} ${item.activity_title} ${item.status}`,
                  ),
              )
              .map((item) => [
                item.employeeName,
                item.competency,
                `${item.activity_title} (${item.activity_type})`,
                item.courseTitle ?? "Unavailable — no mapped course",
                `${item.rationale}\nVerification: ${item.verification_method}`,
                <div className="flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    onClick={() =>
                      run(() => acceptRecommendation({ data: { id: item.id, targetDate: null } }))
                    }
                  >
                    Accept to draft plan
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      run(() =>
                        reviewRecommendation({
                          data: {
                            id: item.id,
                            decision: "EVIDENCE_REQUESTED",
                            reason: feedback || "Additional source evidence requested.",
                          },
                        }),
                      )
                    }
                  >
                    Request evidence
                  </Button>
                  <Button
                    size="sm"
                    variant="destructive"
                    onClick={() =>
                      run(() =>
                        reviewRecommendation({
                          data: {
                            id: item.id,
                            decision: "REJECTED",
                            reason: feedback || "Rejected by reviewer.",
                          },
                        }),
                      )
                    }
                  >
                    Reject
                  </Button>
                </div>,
              ])}
          />
          {!workspace.recommendations.length ? (
            <EmptyState
              title="AI recommendation service is not configured"
              description="This queue reads only persisted recommendation outputs tied to approved competency assessments and actual requirement gaps. No Gemini service or recommendation-generation records exist yet, so the system does not fabricate suggestions."
            />
          ) : null}
          <div className="mt-4 max-w-xl">
            <Field label="Optional reviewer note">
              <Textarea
                value={feedback}
                onChange={(event) => setFeedback(event.currentTarget.value)}
                placeholder="Reason or evidence requested"
              />
            </Field>
          </div>
        </Section>
      ) : null}

      {module === "competencies" ? (
        <Section title="Authorized competency gaps">
          <Table
            headers={[
              "Employee",
              "Position",
              "Competency",
              "Current / required",
              "Gap",
              "Mandatory qualification",
              "Status",
            ]}
            rows={workspace.gaps
              .filter((gap) =>
                match(`${gap.employeeName} ${gap.position} ${gap.competency} ${gap.status}`),
              )
              .map((gap) => [
                gap.employeeName,
                gap.position,
                gap.competency,
                `${gap.currentLevel ?? "Unassessed"} / ${gap.requiredLevel}`,
                gap.gap ?? "Unassessed",
                gap.mandatory ? (gap.qualificationMissing ? "Missing" : "Tracked") : "No",
                gap.status,
              ])}
          />
          {!workspace.gaps.length ? (
            <EmptyState
              title="No approved requirements available"
              description="HR must publish approved position competency requirements before operational gap planning can begin."
            />
          ) : null}
        </Section>
      ) : null}

      {module === "development-plans" ? (
        <>
          <Section title="Create a plan from an approved gap">
            {!gapOptions?.length ? (
              <EmptyState
                title="No assessed numeric gaps are available"
                description="A plan requires an approved assessment below its approved position requirement. Unassessed employees must first receive an evidence-based Supervisor assessment."
              />
            ) : (
              <form
                className="grid gap-4 md:grid-cols-2"
                onSubmit={(event) => {
                  const values = formData(event);
                  run(() =>
                    createPlan({
                      data: {
                        employeeId: String(values.get("employeeId")),
                        assessmentId: String(values.get("assessmentId")),
                        requirementItemId: String(values.get("requirementItemId")),
                        title: String(values.get("title")),
                        activityType: String(values.get("activityType")),
                        activityDescription: String(values.get("activityDescription")),
                        successCriteria: String(values.get("successCriteria")),
                        targetDate: String(values.get("targetDate") || "") || null,
                        ownerUserId: null,
                        recommendationId: null,
                      },
                    }),
                  );
                }}
              >
                <Field label="Competency gap">
                  <select
                    name="gap"
                    required
                    defaultValue=""
                    className="h-9 rounded-md border bg-background px-3"
                    onChange={(event) => {
                      const gap = gapOptions.find(
                        (item) => item.requirementItemId === event.currentTarget.value,
                      );
                      const form = event.currentTarget.form;
                      if (form && gap) {
                        (form.elements.namedItem("assessmentId") as HTMLInputElement).value =
                          gap.assessmentId ?? "";
                        (form.elements.namedItem("requirementItemId") as HTMLInputElement).value =
                          gap.requirementItemId;
                        (form.elements.namedItem("employeeId") as HTMLInputElement).value =
                          gap.employeeId;
                      }
                    }}
                  >
                    <option value="" disabled>
                      Select an approved current gap
                    </option>
                    {gapOptions.map((gap) => (
                      <option key={gap.requirementItemId} value={gap.requirementItemId}>
                        {gap.employeeName} · {gap.competency} · {gap.currentLevel}/
                        {gap.requiredLevel}
                      </option>
                    ))}
                  </select>
                </Field>
                <input type="hidden" name="assessmentId" />
                <input type="hidden" name="requirementItemId" />
                <input type="hidden" name="employeeId" />
                <Field label="Plan title">
                  <Input name="title" required />
                </Field>
                <Field label="Activity type">
                  <Input
                    name="activityType"
                    placeholder="Course, coaching, practical training"
                    required
                  />
                </Field>
                <Field label="Activity description">
                  <Textarea name="activityDescription" required />
                </Field>
                <Field label="Success / verification criteria">
                  <Textarea name="successCriteria" required />
                </Field>
                <Field label="Target date">
                  <Input name="targetDate" type="date" />
                </Field>
                <Button type="submit" disabled={mutation.isPending}>
                  Create draft plan
                </Button>
              </form>
            )}
          </Section>
          <Section title="Development plan register">
            <Table
              headers={["Employee", "Plan", "Competency", "Target", "Status", "Actions"]}
              rows={workspace.plans
                .filter((plan) =>
                  match(`${plan.employeeName} ${plan.title} ${plan.status} ${plan.competency}`),
                )
                .map((plan) => [
                  plan.employeeName,
                  plan.title,
                  plan.competency,
                  formatDate(plan.target_date),
                  <StatusBadge>{plan.status.replaceAll("_", " ")}</StatusBadge>,
                  <div className="flex flex-wrap gap-2">
                    {plan.status === "DRAFT" ? (
                      <Button
                        size="sm"
                        onClick={() => run(() => submitPlan({ data: { id: plan.id } }))}
                      >
                        Submit
                      </Button>
                    ) : null}
                    {plan.status === "PENDING_APPROVAL" && workspace.permissions.approvePlans ? (
                      <>
                        <Button
                          size="sm"
                          onClick={() =>
                            run(() =>
                              decidePlan({
                                data: {
                                  id: plan.id,
                                  approve: true,
                                  reason: "Approved for development.",
                                },
                              }),
                            )
                          }
                        >
                          Approve
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() =>
                            run(() =>
                              decidePlan({
                                data: {
                                  id: plan.id,
                                  approve: false,
                                  reason: feedback || "Please revise the plan.",
                                },
                              }),
                            )
                          }
                        >
                          Return
                        </Button>
                      </>
                    ) : null}
                    {["APPROVED", "ACTIVE"].includes(plan.status) ? (
                      <AssignCourseAction
                        planId={plan.id}
                        employeeId={plan.employee_id}
                        courses={workspace.courses.filter(
                          (course) =>
                            course.status === "PUBLISHED" &&
                            course.competencyIds.includes(
                              workspace.gaps.find(
                                (gap) => gap.requirementItemId === plan.requirement_item_id,
                              )?.competencyDefinitionId ?? "",
                            ),
                        )}
                        onAssign={(courseId, dueAt) =>
                          run(() =>
                            assignCourse({
                              data: {
                                employeeId: plan.employee_id,
                                courseId,
                                planId: plan.id,
                                dueAt,
                              },
                            }),
                          )
                        }
                      />
                    ) : null}
                    {["APPROVED", "ACTIVE"].includes(plan.status) ? (
                      <PlanReassessmentAction
                        planId={plan.id}
                        employeeId={plan.employee_id}
                        sourceAssessmentId={plan.assessment_id}
                        requirementItemId={plan.requirement_item_id}
                        assessments={workspace.assessments}
                        gaps={workspace.gaps}
                        onLink={(assessmentId) =>
                          run(() => linkReassessment({ data: { planId: plan.id, assessmentId } }))
                        }
                      />
                    ) : null}
                  </div>,
                ])}
            />
          </Section>
        </>
      ) : null}

      {module === "courses" ? (
        <>
          <Section title="Create a competency-mapped course version">
            <form
              className="grid gap-4 md:grid-cols-2"
              onSubmit={(event) => {
                const values = formData(event);
                run(() =>
                  createCourse({
                    data: {
                      code: String(values.get("code")),
                      title: String(values.get("title")),
                      description: String(values.get("description")),
                      category: String(values.get("category")),
                      format: String(values.get("format")) as
                        "SELF_PACED" | "INSTRUCTOR_LED" | "PRACTICAL" | "BLENDED",
                      durationMinutes: Number(values.get("durationMinutes")),
                      targetRoles: String(values.get("targetRoles"))
                        .split(/\r?\n/)
                        .map((value) => value.trim())
                        .filter(Boolean),
                      objectives: String(values.get("objectives"))
                        .split(/\r?\n/)
                        .map((v) => v.trim())
                        .filter(Boolean),
                      content: String(values.get("content")),
                      prerequisites: String(values.get("prerequisites"))
                        .split(/\r?\n/)
                        .map((value) => value.trim())
                        .filter(Boolean),
                      completionCriteria: String(values.get("completionCriteria")),
                      reviewDueOn: String(values.get("reviewDueOn") || "") || null,
                      versionNotes: String(values.get("versionNotes")),
                      competencyIds: values.getAll("competencyIds").map(String),
                    },
                  }),
                );
                event.currentTarget.reset();
              }}
            >
              <Field label="Course code">
                <Input name="code" required />
              </Field>
              <Field label="Title">
                <Input name="title" required />
              </Field>
              <Field label="Category">
                <Input name="category" required />
              </Field>
              <Field label="Format">
                <select name="format" className="h-9 rounded-md border bg-background px-3">
                  <option value="SELF_PACED">Self-paced</option>
                  <option value="INSTRUCTOR_LED">Instructor-led</option>
                  <option value="PRACTICAL">Practical</option>
                  <option value="BLENDED">Blended</option>
                </select>
              </Field>
              <Field label="Duration in minutes">
                <Input name="durationMinutes" type="number" min="0" defaultValue="0" />
              </Field>
              <Field label="Description">
                <Textarea name="description" />
              </Field>
              <Field label="Objectives — one per line">
                <Textarea name="objectives" />
              </Field>
              <Field label="Target roles — one per line">
                <Textarea name="targetRoles" />
              </Field>
              <Field label="Prerequisite courses or qualifications — one per line">
                <Textarea name="prerequisites" />
              </Field>
              <Field label="Learning material / course content">
                <Textarea
                  name="content"
                  required
                  placeholder="Add lesson text, steps, materials, and completion instructions."
                />
              </Field>
              <Field label="Completion criteria">
                <Input name="completionCriteria" required />
              </Field>
              <Field label="Next review date">
                <Input name="reviewDueOn" type="date" />
              </Field>
              <Field label="Version notes">
                <Textarea name="versionNotes" />
              </Field>
              <Field label="Mapped competencies — select one or more">
                <select
                  multiple
                  name="competencyIds"
                  required
                  className="min-h-28 rounded-md border bg-background px-3 py-2"
                >
                  {workspace.competencies.map((competency) => (
                    <option key={competency.id} value={competency.id}>
                      {competency.name}
                    </option>
                  ))}
                </select>
              </Field>
              <Button type="submit" disabled={mutation.isPending}>
                Save draft course
              </Button>
            </form>
          </Section>
          <Section title="Course catalog and publishing workflow">
            <Table
              headers={[
                "Code / version",
                "Course",
                "Competency mapping",
                "Target roles",
                "Next review",
                "Format",
                "Status",
                "Action",
              ]}
              rows={workspace.courses
                .filter((course) =>
                  match(`${course.code} ${course.title} ${course.category} ${course.status}`),
                )
                .map((course) => [
                  `${course.code} v${course.version}`,
                  course.title,
                  course.competencyIds
                    .map(
                      (id) =>
                        workspace.competencies.find((competency) => competency.id === id)?.name,
                    )
                    .filter(Boolean)
                    .join(", "),
                  course.target_roles.join(", ") || "All roles",
                  formatDate(course.review_due_on),
                  course.format,
                  <StatusBadge>{course.status.replaceAll("_", " ")}</StatusBadge>,
                  course.status === "DRAFT" ? (
                    <Button
                      size="sm"
                      onClick={() => run(() => submitCourse({ data: { id: course.id } }))}
                    >
                      Submit for review
                    </Button>
                  ) : course.status === "PENDING_REVIEW" && workspace.permissions.reviewCourses ? (
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        onClick={() =>
                          run(() => reviewCourse({ data: { id: course.id, publish: true } }))
                        }
                      >
                        Publish
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() =>
                          run(() => reviewCourse({ data: { id: course.id, publish: false } }))
                        }
                      >
                        Archive
                      </Button>
                    </div>
                  ) : course.status === "PENDING_REVIEW" ? (
                    "Awaiting authorized content reviewer"
                  ) : (
                    "—"
                  ),
                ])}
            />
            {workspace.courses.length === 0 ? (
              <EmptyState
                title="Course catalog is empty"
                description="Create a course mapped to one or more active competencies, then submit it for review. Only published courses can be placed in learning paths or scheduled."
              />
            ) : null}
          </Section>
        </>
      ) : null}

      {module === "learning-paths" ? (
        <>
          <Section title="Create a sequenced learning path">
            <form
              className="grid gap-4 md:grid-cols-2"
              onSubmit={(event) => {
                const values = formData(event);
                run(() =>
                  createPath({
                    data: {
                      name: String(values.get("name")),
                      description: String(values.get("description")),
                      targetJobPositionId: String(values.get("targetJobPositionId") || "") || null,
                      courseIds: values.getAll("courseIds").map(String),
                    },
                  }),
                );
                event.currentTarget.reset();
              }}
            >
              <Field label="Path name">
                <Input name="name" required />
              </Field>
              <Field label="Purpose">
                <Textarea name="description" />
              </Field>
              <Field label="Target position (optional)">
                <select
                  name="targetJobPositionId"
                  className="h-9 rounded-md border bg-background px-3"
                >
                  <option value="">All positions</option>
                  {workspace.positions.map((position) => (
                    <option key={position.id} value={position.id}>
                      {position.name}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Published courses in sequence">
                <select
                  name="courseIds"
                  multiple
                  required
                  className="min-h-28 rounded-md border bg-background px-3 py-2"
                >
                  {publishedCourses.map((course) => (
                    <option key={course.id} value={course.id}>
                      {course.title}
                    </option>
                  ))}
                </select>
              </Field>
              <Button type="submit" disabled={mutation.isPending || !publishedCourses.length}>
                Create draft path
              </Button>
            </form>
            {!publishedCourses.length ? (
              <p className="mt-3 text-sm text-muted-foreground">
                Publish mapped courses before building a learning path.
              </p>
            ) : null}
          </Section>
          <Section title="Learning path register">
            <Table
              headers={["Path", "Version", "Sequence", "Status", "Action"]}
              rows={workspace.paths
                .filter((path) => match(`${path.name} ${path.status}`))
                .map((path) => [
                  path.name,
                  path.version,
                  workspace.pathCourses
                    .filter((item) => item.path_id === path.id)
                    .sort((a, b) => a.sequence_number - b.sequence_number)
                    .map(
                      (item) =>
                        workspace.courses.find((course) => course.id === item.course_id)?.title,
                    )
                    .filter(Boolean)
                    .join(" → "),
                  <StatusBadge>{path.status}</StatusBadge>,
                  path.status === "DRAFT" ? (
                    <Button
                      size="sm"
                      onClick={() => run(() => publishPath({ data: { id: path.id } }))}
                    >
                      Publish path
                    </Button>
                  ) : (
                    "—"
                  ),
                ])}
            />
          </Section>
        </>
      ) : null}

      {module === "quizzes" ? (
        <>
          <Section title="Create a course knowledge check">
            <form
              className="grid gap-4 md:grid-cols-2"
              onSubmit={(event) => {
                const values = formData(event);
                let parsedQuestions: unknown;
                try {
                  parsedQuestions = JSON.parse(String(values.get("questions")));
                } catch {
                  toast.error("Quiz questions must be valid JSON.");
                  return;
                }
                const validatedQuestions = quizQuestionSchema.safeParse(parsedQuestions);
                if (!validatedQuestions.success) {
                  toast.error(
                    "Each question needs a prompt, at least two options, a valid correctOption index, and positive points.",
                  );
                  return;
                }
                run(() =>
                  createQuiz({
                    data: {
                      courseId: String(values.get("courseId")),
                      title: String(values.get("title")),
                      passThreshold: Number(values.get("passThreshold")),
                      attemptLimit: Number(values.get("attemptLimit")),
                      questions: validatedQuestions.data,
                    },
                  }),
                );
                event.currentTarget.reset();
              }}
            >
              <Field label="Course">
                <select
                  name="courseId"
                  required
                  className="h-9 rounded-md border bg-background px-3"
                >
                  {publishedCourses.map((course) => (
                    <option key={course.id} value={course.id}>
                      {course.title}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Quiz title">
                <Input name="title" required />
              </Field>
              <Field label="Pass threshold (%)">
                <Input name="passThreshold" type="number" min="0" max="100" defaultValue="80" />
              </Field>
              <Field label="Attempt limit">
                <Input name="attemptLimit" type="number" min="1" defaultValue="2" />
              </Field>
              <Field label="Questions JSON (prompt, options, correctOption index, points)">
                <Textarea
                  name="questions"
                  required
                  placeholder={
                    '[{"prompt":"Which procedure is required?","options":["A","B"],"correctOption":0,"points":1}]'
                  }
                />
              </Field>
              <Button type="submit" disabled={mutation.isPending || !publishedCourses.length}>
                Save quiz draft
              </Button>
            </form>
            {!publishedCourses.length ? (
              <p className="text-sm text-muted-foreground">
                A quiz must be linked to an existing published course.
              </p>
            ) : null}
          </Section>
          <Section title="Quizzes and learner results">
            <Table
              headers={[
                "Quiz",
                "Course",
                "Version",
                "Pass threshold",
                "Status",
                "Attempts",
                "Action",
              ]}
              rows={workspace.quizzes.map((quiz) => [
                quiz.title,
                workspace.courses.find((course) => course.id === quiz.course_id)?.title ?? "Course",
                quiz.version,
                `${quiz.pass_threshold}%`,
                <StatusBadge>{quiz.status}</StatusBadge>,
                workspace.quizAttempts.filter((attempt) => attempt.quiz_id === quiz.id).length,
                quiz.status === "DRAFT" ? (
                  <Button
                    size="sm"
                    onClick={() => run(() => publishQuiz({ data: { id: quiz.id } }))}
                  >
                    Publish
                  </Button>
                ) : (
                  "—"
                ),
              ])}
            />
          </Section>
        </>
      ) : null}

      {module === "learners" ? (
        <Section title="Course assignment progress">
          <Table
            headers={[
              "Employee",
              "Course",
              "Assigned",
              "Due",
              "Progress",
              "Status",
              "Quiz results",
            ]}
            rows={workspace.assignments
              .filter((item) => match(`${item.employeeName} ${item.courseTitle} ${item.status}`))
              .map((item) => [
                item.employeeName,
                item.courseTitle,
                formatDate(item.assigned_at),
                formatDate(item.due_at),
                `${item.progress_percent}%`,
                <StatusBadge>{item.status.replaceAll("_", " ")}</StatusBadge>,
                workspace.quizAttempts
                  .filter(
                    (attempt) =>
                      attempt.employee_id === item.employee_id &&
                      workspace.quizzes.some(
                        (quiz) => quiz.course_id === item.course_id && quiz.id === attempt.quiz_id,
                      ),
                  )
                  .map(
                    (attempt) =>
                      `${attempt.score ?? "Pending"}% ${attempt.passed ? "Pass" : attempt.passed === false ? "Fail" : ""}`,
                  )
                  .join(", ") || "No quiz attempts",
              ])}
          />
          {workspace.assignments.length === 0 ? (
            <EmptyState
              title="No learner assignments"
              description="Assignments are created from an approved development plan and a course mapped to that plan's competency gap."
            />
          ) : null}
        </Section>
      ) : null}

      {module === "calendar" ? (
        <Section title="Scheduled training calendar">
          <Table
            headers={[
              "Session",
              "Course / activity",
              "Trainer",
              "Starts",
              "Ends",
              "Venue",
              "Participants",
              "Status",
            ]}
            rows={workspace.sessions
              .filter((session) =>
                match(`${session.title} ${session.courseTitle} ${session.venue} ${session.status}`),
              )
              .map((session) => [
                session.title,
                session.courseTitle,
                session.trainer_user_id ?? "Not assigned",
                formatDate(session.starts_at),
                formatDate(session.ends_at),
                session.venue || "Not set",
                `${session.participantCount}${session.capacity ? ` / ${session.capacity}` : ""}`,
                <StatusBadge>{session.status}</StatusBadge>,
              ])}
          />
          {workspace.sessions.length === 0 ? (
            <EmptyState
              title="No training sessions scheduled"
              description="Schedule a session from Training Sessions & Attendance. Each session must link to a published course or approved development plan."
            />
          ) : null}
        </Section>
      ) : null}

      {module === "sessions" ? (
        <>
          <Section title="Schedule a linked session">
            <form
              className="grid gap-4 md:grid-cols-2"
              onSubmit={(event) => {
                const values = formData(event);
                run(() =>
                  createSession({
                    data: {
                      title: String(values.get("title")),
                      courseId: String(values.get("courseId") || "") || null,
                      planId: String(values.get("planId") || "") || null,
                      trainerUserId: String(values.get("trainerUserId") || "") || null,
                      startsAt: new Date(String(values.get("startsAt"))).toISOString(),
                      endsAt: new Date(String(values.get("endsAt"))).toISOString(),
                      venue: String(values.get("venue")),
                      capacity: Number(values.get("capacity")) || null,
                      employeeIds: values.getAll("employeeIds").map(String),
                    },
                  }),
                );
                event.currentTarget.reset();
              }}
            >
              <Field label="Session title">
                <Input name="title" required />
              </Field>
              <Field label="Published course">
                <select name="courseId" className="h-9 rounded-md border bg-background px-3">
                  <option value="">Select course if applicable</option>
                  {publishedCourses.map((course) => (
                    <option key={course.id} value={course.id}>
                      {course.title}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Approved / active plan">
                <select name="planId" className="h-9 rounded-md border bg-background px-3">
                  <option value="">Select linked plan if applicable</option>
                  {workspace.plans
                    .filter((plan) => ["APPROVED", "ACTIVE"].includes(plan.status))
                    .map((plan) => (
                      <option key={plan.id} value={plan.id}>
                        {plan.employeeName} · {plan.title}
                      </option>
                    ))}
                </select>
              </Field>
              <Field label="Participant (select one or more)">
                <select
                  name="employeeIds"
                  multiple
                  required
                  className="min-h-24 rounded-md border bg-background px-3 py-2"
                >
                  {employeeOptions.map((employee) => (
                    <option key={employee.employeeId} value={employee.employeeId}>
                      {employee.employeeName} · {employee.employeeNumber}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Trainer user ID (optional)">
                <Input name="trainerUserId" />
              </Field>
              <Field label="Venue / link">
                <Input name="venue" />
              </Field>
              <Field label="Starts">
                <Input name="startsAt" type="datetime-local" required />
              </Field>
              <Field label="Ends">
                <Input name="endsAt" type="datetime-local" required />
              </Field>
              <Field label="Capacity">
                <Input name="capacity" type="number" min="1" />
              </Field>
              <Button type="submit" disabled={mutation.isPending}>
                Schedule and register
              </Button>
            </form>
          </Section>
          <Section title="Attendance register">
            <Table
              headers={["Session", "Employee", "Attendance status", "Recorded", "Actions"]}
              rows={workspace.attendance.map((item) => [
                item.sessionTitle,
                item.employeeName,
                <StatusBadge>{item.status.replaceAll("_", " ")}</StatusBadge>,
                formatDate(item.recorded_at),
                item.status === "REGISTERED" ? (
                  <div className="flex flex-wrap gap-2">
                    {(["ATTENDED", "PARTIAL", "ABSENT", "EXCUSED"] as const).map((status) => (
                      <Button
                        key={status}
                        size="sm"
                        variant="outline"
                        onClick={() =>
                          run(() => updateAttendance({ data: { id: item.id, status, notes: "" } }))
                        }
                      >
                        {status}
                      </Button>
                    ))}
                  </div>
                ) : (
                  "Recorded"
                ),
              ])}
            />
          </Section>
        </>
      ) : null}

      {module === "reassessments" ? (
        <Section title="Due or overdue reassessment follow-up">
          <p className="mb-4 text-sm text-muted-foreground">
            Operations coordinates follow-up and training. It cannot certify competency: the
            assigned Supervisor/qualified assessor must submit a new evidence-backed reassessment
            through Competency Management.
          </p>
          <Table
            headers={[
              "Employee",
              "Position",
              "Competency",
              "Current / required",
              "Numeric gap",
              "Qualification",
              "Due",
              "Status",
            ]}
            rows={workspace.reassessments
              .filter((gap) => match(`${gap.employeeName} ${gap.competency} ${gap.status}`))
              .map((gap) => [
                gap.employeeName,
                gap.position,
                gap.competency,
                `${gap.currentLevel ?? "Unassessed"} / ${gap.requiredLevel}`,
                gap.gap ?? "Unassessed",
                gap.qualificationMissing ? "Missing" : gap.mandatory ? "Tracked" : "No",
                formatDate(gap.nextAssessmentOn),
                gap.status,
              ])}
          />
          {!workspace.reassessments.length ? (
            <EmptyState
              title="No reassessments are currently due"
              description="Next assessment dates are sourced from approved competency assessments. A completed course or attendance record does not change competency levels."
            />
          ) : null}
        </Section>
      ) : null}

      {module === "effectiveness" ? (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <SummaryCard
              label="Training plans completed"
              value={workspace.plans.filter((plan) => plan.status === "COMPLETED").length}
            />
            <SummaryCard
              label="Plans with verified follow-up"
              value={workspace.plans.filter((plan) => plan.followup_assessment_id).length}
              description="Follow-up links reference actual competency assessment records."
            />
            <SummaryCard
              label="Open numeric gaps"
              value={workspace.gaps.filter((gap) => gap.status === "Gap").length}
            />
            <SummaryCard
              label="Unassessed / mandatory qualification issues"
              value={
                workspace.gaps.filter(
                  (gap) => gap.status === "Unassessed" || gap.qualificationMissing,
                ).length
              }
            />
          </div>
          <Section title="Gap outcomes and plan follow-up">
            <Table
              headers={[
                "Employee",
                "Competency",
                "Gap status",
                "Linked plans",
                "Verified reassessment",
              ]}
              rows={workspace.gaps
                .filter((gap) => match(`${gap.employeeName} ${gap.competency}`))
                .map((gap) => {
                  const plans = workspace.plans.filter(
                    (plan) => plan.requirement_item_id === gap.requirementItemId,
                  );
                  return [
                    gap.employeeName,
                    gap.competency,
                    gap.status,
                    plans.map((plan) => `${plan.title} (${plan.status})`).join("; ") || "No plan",
                    plans.some((plan) => plan.followup_assessment_id) ? "Linked" : "Not verified",
                  ];
                })}
            />
          </Section>
        </>
      ) : null}

      {module === "reports" ? (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <SummaryCard label="Mapped course versions" value={workspace.courses.length} />
            <SummaryCard label="Course assignments" value={workspace.assignments.length} />
            <SummaryCard
              label="Training participants registered"
              value={workspace.attendance.length}
            />
            <SummaryCard label="Development plans" value={workspace.plans.length} />
          </div>
          <Section title="Gap and training status report">
            <Table
              headers={["Metric", "Current records"]}
              rows={[
                [
                  "Published courses",
                  workspace.courses.filter((course) => course.status === "PUBLISHED").length,
                ],
                [
                  "Draft / awaiting content review",
                  workspace.courses.filter((course) =>
                    ["DRAFT", "PENDING_REVIEW"].includes(course.status),
                  ).length,
                ],
                [
                  "Pending AI recommendation review",
                  workspace.recommendations.filter((item) => item.status === "PENDING_REVIEW")
                    .length,
                ],
                [
                  "Plans awaiting approval",
                  workspace.plans.filter((plan) => plan.status === "PENDING_APPROVAL").length,
                ],
                [
                  "Learners in progress",
                  workspace.assignments.filter((item) => item.status === "IN_PROGRESS").length,
                ],
                ["Due reassessments", workspace.reassessments.length],
                [
                  "Unresolved approved requirement gaps",
                  workspace.gaps.filter((gap) => gap.status === "Gap" || gap.qualificationMissing)
                    .length,
                ],
              ].map(([label, count]) => [label, count])}
            />
            <p className="mt-3 text-xs text-muted-foreground">
              This is an operational live summary, not an export or a confidential HR/performance
              report. CSV export and scheduled report delivery are not implemented.
            </p>
          </Section>
        </>
      ) : null}
    </div>
  );
}

function AssignCourseAction({
  planId,
  employeeId,
  courses,
  onAssign,
}: {
  planId: string;
  employeeId: string;
  courses: Array<{ id: string; title: string }>;
  onAssign: (courseId: string, dueAt: string | null) => void;
}) {
  const [courseId, setCourseId] = useState(courses[0]?.id ?? "");
  const [dueAt, setDueAt] = useState("");
  if (!courses.length)
    return (
      <span className="text-xs text-muted-foreground">
        No published course mapped to this plan's gap
      </span>
    );
  return (
    <div className="flex flex-wrap gap-2">
      <select
        aria-label="Mapped course"
        value={courseId}
        onChange={(event) => setCourseId(event.currentTarget.value)}
        className="h-8 rounded-md border bg-background px-2 text-xs"
      >
        {courses.map((course) => (
          <option key={course.id} value={course.id}>
            {course.title}
          </option>
        ))}
      </select>
      <Input
        aria-label="Course due date"
        type="date"
        value={dueAt}
        onChange={(event) => setDueAt(event.currentTarget.value)}
        className="h-8 w-36"
      />
      <Button
        size="sm"
        onClick={() => onAssign(courseId, dueAt || null)}
        data-plan={planId}
        data-employee={employeeId}
      >
        Assign
      </Button>
    </div>
  );
}

function PlanReassessmentAction({
  planId,
  employeeId,
  sourceAssessmentId,
  requirementItemId,
  assessments,
  gaps,
  onLink,
}: {
  planId: string;
  employeeId: string;
  sourceAssessmentId: string;
  requirementItemId: string;
  assessments: OperationsWorkspaceData["assessments"];
  gaps: OperationsWorkspaceData["gaps"];
  onLink: (assessmentId: string) => void;
}) {
  const [assessmentId, setAssessmentId] = useState("");
  const gap = gaps.find((item) => item.requirementItemId === requirementItemId);
  const source = assessments.find((assessment) => assessment.id === sourceAssessmentId);
  const validAssessments = assessments.filter(
    (assessment) =>
      gap &&
      source &&
      assessment.id !== sourceAssessmentId &&
      assessment.employee_id === employeeId &&
      assessment.competency_definition_id === gap.competencyDefinitionId &&
      assessment.status === "APPROVED" &&
      assessment.evidence_validated_by &&
      assessment.assessed_on > source.assessed_on &&
      assessment.assessed_level >= gap.requiredLevel,
  );
  if (!validAssessments.length)
    return (
      <span className="text-xs text-muted-foreground">
        Awaiting qualified, evidence-validated reassessment to close
      </span>
    );
  return (
    <div className="flex flex-wrap gap-2">
      <select
        aria-label={`Verified reassessment for plan ${planId}`}
        className="h-8 rounded-md border bg-background px-2 text-xs"
        value={assessmentId}
        onChange={(event) => setAssessmentId(event.currentTarget.value)}
      >
        <option value="">Select verified reassessment</option>
        {validAssessments.map((assessment) => (
          <option key={assessment.id} value={assessment.id}>
            {assessment.assessed_on} · Level {assessment.assessed_level}
          </option>
        ))}
      </select>
      <Button size="sm" disabled={!assessmentId} onClick={() => onLink(assessmentId)}>
        Verify & close
      </Button>
    </div>
  );
}
