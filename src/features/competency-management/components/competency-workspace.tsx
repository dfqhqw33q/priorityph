import { useMemo, useState, type FormEvent, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

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
  createCompetencyRequirements,
  decideCompetencyAssessment,
  decideCompetencyRequirements,
  getCompetencyWorkspace,
  saveCompetencyDefinition,
  submitCompetencyAssessment,
  validateCompetencyEvidence,
  type CompetencyWorkspaceData,
} from "@/lib/competency.functions";

type ViewKey =
  | "overview"
  | "library"
  | "requirements"
  | "matrix"
  | "gaps"
  | "assess"
  | "evidence"
  | "reassess"
  | "review"
  | "history"
  | "development";

const LEVEL_LABELS = ["Foundational", "Developing", "Proficient", "Advanced", "Expert"];
const LEVEL_HINTS = [
  "Requires close guidance; performs basic tasks with support.",
  "Performs routine tasks with periodic guidance.",
  "Works independently to the expected standard.",
  "Handles complex situations and supports others.",
  "Demonstrates expert practice and improves standards.",
];

function viewsForRole(data: CompetencyWorkspaceData): Array<{ key: ViewKey; label: string }> {
  if (data.role === "HR") {
    return [
      { key: "overview", label: "Competency Dashboard" },
      { key: "library", label: "Competency Library" },
      { key: "requirements", label: "Job Requirements" },
      { key: "matrix", label: "Employee Matrix" },
      { key: "gaps", label: "Gap Analysis" },
      { key: "review", label: "Assessment Review" },
      { key: "history", label: "Detail & History" },
    ];
  }
  if (data.role === "SUPERVISOR") {
    return [
      { key: "overview", label: "Team Competencies" },
      { key: "assess", label: "Assessment Form" },
      { key: "gaps", label: "Team Gap Analysis" },
      { key: "evidence", label: "Evidence Validation" },
      { key: "reassess", label: "Reassessment" },
      { key: "history", label: "Assessment History" },
    ];
  }
  if (data.role === "DEPARTMENT_HEAD") {
    return [
      { key: "overview", label: "Department Overview" },
      { key: "gaps", label: "Department Gap Analysis" },
      { key: "review", label: "Authorized Reviews" },
      { key: "history", label: "Assessment History" },
    ];
  }
  if (data.role === "EMPLOYEE") {
    return [
      { key: "overview", label: "My Competencies" },
      { key: "history", label: "My Competency History" },
      { key: "development", label: "My Development Needs" },
    ];
  }
  return [
    { key: "gaps", label: "Competency Gaps" },
    { key: "reassess", label: "Authorized Reassessment" },
    { key: "history", label: "Assessment History" },
  ];
}

function parseLines(value: string) {
  return value
    .split(/\r?\n/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function fieldClass() {
  return "space-y-1.5 text-sm font-medium";
}

function SelectField({
  label,
  value,
  onChange,
  children,
  required = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  children: ReactNode;
  required?: boolean;
}) {
  return (
    <label className={fieldClass()}>
      <span>
        {label}
        {required ? " *" : ""}
      </span>
      <select
        className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
        required={required}
        value={value}
        onChange={(event) => onChange(event.currentTarget.value)}
      >
        {children}
      </select>
    </label>
  );
}

function CompetencyTable({
  data,
  view,
  search,
  onSearch,
  onValidate,
  onDecide,
}: {
  data: CompetencyWorkspaceData;
  view: ViewKey;
  search: string;
  onSearch: (value: string) => void;
  onValidate: (assessmentId: string, valid: boolean) => void;
  onDecide: (assessmentId: string, approve: boolean) => void;
}) {
  const employeeById = new Map(data.employees.map((employee) => [employee.id, employee]));
  const definitionById = new Map(data.definitions.map((definition) => [definition.id, definition]));
  const relevantRequirementSets = data.requirementSets
    .filter(
      (set) =>
        set.status === "APPROVED" && set.effectiveFrom <= new Date().toISOString().slice(0, 10),
    )
    .sort((left, right) => right.version - left.version);
  const activeSetByPosition = new Map<string, CompetencyWorkspaceData["requirementSets"][number]>();
  for (const set of relevantRequirementSets) {
    if (!activeSetByPosition.has(set.positionId)) activeSetByPosition.set(set.positionId, set);
  }
  const latestApproved = new Map<string, CompetencyWorkspaceData["assessments"][number]>();
  for (const assessment of [...data.assessments].sort(
    (left, right) =>
      left.assessedOn.localeCompare(right.assessedOn) || left.version - right.version,
  )) {
    if (assessment.status !== "APPROVED") continue;
    const key = `${assessment.employeeId}:${assessment.competencyDefinitionId}`;
    const current = latestApproved.get(key);
    if (
      !current ||
      assessment.assessedOn > current.assessedOn ||
      (assessment.assessedOn === current.assessedOn && assessment.version > current.version)
    ) {
      latestApproved.set(key, assessment);
    }
  }

  const assessmentsToShow = data.assessments.filter((assessment) => {
    if (view === "evidence") return assessment.status === "SUBMITTED";
    if (view === "review")
      return assessment.status === "SUBMITTED" && assessment.evidenceValidatedAt !== null;
    if (view === "reassess") return assessment.version > 1 || assessment.status !== "APPROVED";
    return view === "history" || view === "development";
  });
  const visibleAssessments = assessmentsToShow.filter((assessment) => {
    const employee = employeeById.get(assessment.employeeId);
    const definition = definitionById.get(assessment.competencyDefinitionId);
    return `${employee?.name ?? ""} ${employee?.number ?? ""} ${definition?.name ?? ""} ${definition?.category ?? ""} ${assessment.status}`
      .toLowerCase()
      .includes(search.trim().toLowerCase());
  });

  if (view === "library") {
    return (
      <div className="space-y-3">
        <SearchBox value={search} onChange={onSearch} label="Search competencies" />
        {data.definitions.length ? (
          <div className="grid gap-3 md:grid-cols-2">
            {data.definitions
              .filter((definition) =>
                `${definition.code} ${definition.name} ${definition.category}`
                  .toLowerCase()
                  .includes(search.trim().toLowerCase()),
              )
              .map((definition) => (
                <Card key={definition.id}>
                  <CardHeader>
                    <CardTitle className="flex items-center justify-between gap-3 text-base">
                      <span>{definition.name}</span>
                      <StatusBadge>{`v${definition.version}`}</StatusBadge>
                    </CardTitle>
                    <p className="text-xs text-muted-foreground">
                      {definition.code} · {definition.category}
                      {definition.mandatoryQualification ? " · Qualification tracked" : ""}
                    </p>
                  </CardHeader>
                  <CardContent className="space-y-3 text-sm">
                    <p>{definition.description}</p>
                    <div>
                      <p className="font-medium">Observable criteria</p>
                      <ul className="list-disc pl-5 text-muted-foreground">
                        {definition.criteria.map((criterion) => (
                          <li key={criterion}>{criterion}</li>
                        ))}
                      </ul>
                    </div>
                    <div className="space-y-1">
                      <p className="font-medium">Proficiency levels</p>
                      {definition.levels.map((level) => (
                        <p key={level.level} className="text-muted-foreground">
                          {level.level} — {level.label}: {level.definition}
                        </p>
                      ))}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Methods: {definition.methods.join(", ")} · Evidence:{" "}
                      {definition.evidenceRequirements.join("; ")}
                    </p>
                  </CardContent>
                </Card>
              ))}
          </div>
        ) : (
          <EmptyState
            title="Competency library is empty"
            description="HR can create versioned competencies with observable proficiency definitions."
          />
        )}
      </div>
    );
  }

  if (view === "requirements" && data.permissions.manageRequirements) {
    return (
      <div className="space-y-5">
        <SearchBox value={search} onChange={onSearch} label="Search requirement versions" />
        {data.requirementSets.map((set) => (
          <Card key={set.id}>
            <CardContent className="flex flex-col gap-3 pt-6 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <p className="font-semibold">
                  {data.positions.find((position) => position.id === set.positionId)?.name ??
                    "Position"}{" "}
                  · Requirement version {set.version}
                </p>
                <p className="text-sm text-muted-foreground">
                  Effective {set.effectiveFrom} · {set.items.length} requirements ·{" "}
                  {set.items.filter((item) => item.mandatoryQualification).length} mandatory
                </p>
                {set.decisionReason ? (
                  <p className="mt-1 text-sm text-muted-foreground">Reason: {set.decisionReason}</p>
                ) : null}
                <ul className="mt-2 space-y-1 text-sm">
                  {set.items.map((item) => (
                    <li key={item.id}>
                      {definitionById.get(item.competencyDefinitionId)?.name ?? "Competency"} —
                      level {item.requiredLevel}
                      {item.mandatoryQualification
                        ? ` · Mandatory: ${item.qualificationLabel ?? "Qualification"}`
                        : ""}
                    </li>
                  ))}
                </ul>
              </div>
              <div className="flex items-center gap-2">
                <StatusBadge>{set.status.replaceAll("_", " ")}</StatusBadge>
                {set.status === "PENDING_APPROVAL" && data.permissions.approveRequirements ? (
                  <>
                    <Button size="sm" onClick={() => onDecide(set.id, true)}>
                      Approve
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => onDecide(set.id, false)}>
                      Return
                    </Button>
                  </>
                ) : null}
              </div>
            </CardContent>
          </Card>
        ))}
        {!data.requirementSets.length ? (
          <EmptyState
            title="No position requirement versions"
            description="Create a draft requirement set for an existing job position."
          />
        ) : null}
      </div>
    );
  }

  if (["overview", "matrix", "gaps"].includes(view)) {
    const rows = data.employees.flatMap((employee) => {
      if (!employee.positionId) return [];
      const set = activeSetByPosition.get(employee.positionId);
      if (!set) return [];
      return set.items.map((item) => {
        const definition = definitionById.get(item.competencyDefinitionId);
        const assessment = latestApproved.get(`${employee.id}:${item.competencyDefinitionId}`);
        const current = assessment?.assessedLevel ?? null;
        const gap = current === null ? null : Math.max(0, item.requiredLevel - current);
        return {
          employee,
          item,
          definition,
          assessment,
          current,
          gap,
          mandatoryOutstanding:
            item.mandatoryQualification && (current === null || current < item.requiredLevel),
        };
      });
    });
    const filteredRows = rows.filter((row) =>
      `${row.employee.name} ${row.employee.number} ${row.employee.position} ${row.employee.department} ${row.definition?.name ?? ""}`
        .toLowerCase()
        .includes(search.trim().toLowerCase()),
    );
    if (!filteredRows.length)
      return (
        <div className="space-y-3">
          <SearchBox value={search} onChange={onSearch} label="Search competency matrix" />
          <EmptyState
            title={
              data.employees.length ? "No approved position requirements" : "No employees in scope"
            }
            description={
              data.employees.length
                ? "Approved job competency requirements define the matrix; missing or pending requirements are not treated as ratings."
                : "No active employee records are currently available in your authorized scope."
            }
          />
        </div>
      );
    return (
      <div className="space-y-3">
        <SearchBox value={search} onChange={onSearch} label="Search competency matrix" />
        <div className="overflow-x-auto rounded-xl border border-border bg-card">
          <table className="w-full min-w-[1000px] text-left text-sm">
            <thead className="border-b border-border text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-3 py-3">Employee / position</th>
                <th className="px-3 py-3">Department</th>
                <th className="px-3 py-3">Competency</th>
                <th className="px-3 py-3">Required</th>
                <th className="px-3 py-3">Current</th>
                <th className="px-3 py-3">Numeric gap</th>
                <th className="px-3 py-3">Mandatory qualification</th>
                <th className="px-3 py-3">Assessment status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filteredRows.map((row) => (
                <tr key={`${row.employee.id}:${row.item.id}`}>
                  <td className="px-3 py-3">
                    <p className="font-medium">{row.employee.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {row.employee.number} · {row.employee.position}
                    </p>
                  </td>
                  <td className="px-3 py-3">{row.employee.department}</td>
                  <td className="px-3 py-3">
                    {row.definition?.name ?? "Competency version unavailable"}
                  </td>
                  <td className="px-3 py-3">{row.item.requiredLevel}</td>
                  <td className="px-3 py-3">{row.current === null ? "Unassessed" : row.current}</td>
                  <td className="px-3 py-3">{row.gap === null ? "Not calculated" : row.gap}</td>
                  <td className="px-3 py-3">
                    {row.item.mandatoryQualification
                      ? row.mandatoryOutstanding
                        ? "Outstanding"
                        : "Requirement met"
                      : "Not mandatory"}
                  </td>
                  <td className="px-3 py-3">
                    {row.assessment
                      ? `${row.assessment.assessedOn} · ${row.assessment.assessorId.slice(0, 8)}`
                      : "Unassessed"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-xs text-muted-foreground">
          Gap = max(0, required level − approved current level). Missing assessments remain
          unassessed. Numeric competency levels do not establish license validity or replace
          separate safety checks.
        </p>
      </div>
    );
  }

  if (
    view === "review" ||
    view === "evidence" ||
    view === "history" ||
    view === "development" ||
    view === "reassess"
  ) {
    if (!visibleAssessments.length)
      return (
        <div className="space-y-3">
          <SearchBox value={search} onChange={onSearch} label="Search assessments" />
          <EmptyState
            title="No matching competency assessments"
            description={
              view === "review"
                ? "Assessments with validated evidence in your authorized scope will appear here."
                : "Assessment submissions and history in your authorized scope will appear here."
            }
          />
        </div>
      );
    return (
      <div className="space-y-3">
        <SearchBox value={search} onChange={onSearch} label="Search assessments" />
        {visibleAssessments.map((assessment) => {
          const employee = employeeById.get(assessment.employeeId);
          const definition = definitionById.get(assessment.competencyDefinitionId);
          const finalizedEvaluation = data.finalizedEvaluations.find(
            (evaluation) =>
              evaluation.employeeId === assessment.employeeId &&
              assessment.evidence.some((item) => item.sourceEvaluationId === evaluation.id),
          );
          return (
            <Card key={assessment.id}>
              <CardContent className="space-y-3 pt-6">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold">
                      {assessment.employeeNameSnapshot || employee?.name || "Employee"} ·{" "}
                      {definition?.name ?? "Competency"}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {assessment.jobPositionSnapshot} ·{" "}
                      {assessment.departmentSnapshot || "No department snapshot"} · Employee ID{" "}
                      {assessment.employeeNumberSnapshot} · Assessment v{assessment.version}
                    </p>
                  </div>
                  <StatusBadge>{assessment.status.replaceAll("_", " ")}</StatusBadge>
                </div>
                <div className="grid gap-2 text-sm sm:grid-cols-3">
                  <p>Assessed level: {assessment.assessedLevel}</p>
                  <p>Method: {assessment.assessmentMethod}</p>
                  <p>Assessed: {assessment.assessedOn}</p>
                  <p>Assessor: {assessment.assessorRole}</p>
                  <p>
                    Evidence: {assessment.evidenceValidatedAt ? "Validated" : "Pending validation"}
                  </p>
                  <p>Next assessment: {assessment.nextAssessmentOn ?? "Not scheduled"}</p>
                </div>
                <p className="whitespace-pre-wrap rounded-md bg-muted/40 p-3 text-sm">
                  {assessment.evidenceNotes}
                </p>
                {assessment.evidence.map((evidence) => (
                  <p key={evidence.id} className="text-xs text-muted-foreground">
                    Evidence reference: {evidence.reference ?? "Attached record"}
                    {evidence.sourceEvaluationId
                      ? ` · finalized evaluation ${finalizedEvaluation?.period ?? evidence.sourceEvaluationId}`
                      : ""}
                    {evidence.sourceAttachmentId
                      ? ` · attachment ${evidence.sourceAttachmentId}`
                      : ""}
                  </p>
                ))}
                {assessment.decisionReason ? (
                  <p className="text-sm text-muted-foreground">
                    Decision: {assessment.decisionReason}
                  </p>
                ) : null}
                {view === "evidence" &&
                assessment.status === "SUBMITTED" &&
                data.permissions.validateEvidence ? (
                  <div className="flex flex-wrap gap-2">
                    <Button size="sm" onClick={() => onValidate(assessment.id, true)}>
                      Validate evidence
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => onValidate(assessment.id, false)}
                    >
                      Request evidence
                    </Button>
                  </div>
                ) : null}
                {view === "review" &&
                assessment.status === "SUBMITTED" &&
                assessment.evidenceValidatedAt &&
                data.permissions.approveAssessments ? (
                  <div className="flex flex-wrap gap-2">
                    <Button size="sm" onClick={() => onDecide(assessment.id, true)}>
                      Approve assessment
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => onDecide(assessment.id, false)}
                    >
                      Return for correction
                    </Button>
                  </div>
                ) : null}
              </CardContent>
            </Card>
          );
        })}
        {view === "history" ? (
          <Card>
            <CardHeader>
              <CardTitle>Workflow audit history</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {data.history.length ? (
                data.history.map((event) => (
                  <div key={event.id} className="rounded-md border p-3 text-sm">
                    <div className="flex flex-wrap justify-between gap-2">
                      <p className="font-medium">{event.action.replaceAll("_", " ")}</p>
                      <time dateTime={event.occurredAt}>
                        {new Date(event.occurredAt).toLocaleString()}
                      </time>
                    </div>
                    <p className="text-muted-foreground">
                      {event.previousStatus ?? "New"} → {event.newStatus ?? "Recorded"}
                      {event.actorUserId ? ` · Actor ${event.actorUserId}` : ""}
                    </p>
                    {event.reason ? (
                      <p className="mt-1 whitespace-pre-wrap">{event.reason}</p>
                    ) : null}
                  </div>
                ))
              ) : (
                <p className="text-sm text-muted-foreground">
                  No workflow decisions or competency changes have been recorded yet.
                </p>
              )}
            </CardContent>
          </Card>
        ) : null}
      </div>
    );
  }
  return (
    <EmptyState
      title="Choose a competency workspace section"
      description="Select a section above to view competency information."
    />
  );
}

function SearchBox({
  value,
  onChange,
  label,
}: {
  value: string;
  onChange: (value: string) => void;
  label: string;
}) {
  return (
    <div className="max-w-md">
      <Input
        aria-label={label}
        placeholder="Search employees, positions, competencies"
        value={value}
        onChange={(event) => onChange(event.currentTarget.value)}
      />
    </div>
  );
}

export function CompetencyWorkspace() {
  const queryClient = useQueryClient();
  const loadWorkspace = useServerFn(getCompetencyWorkspace);
  const saveDefinition = useServerFn(saveCompetencyDefinition);
  const createRequirements = useServerFn(createCompetencyRequirements);
  const decideRequirements = useServerFn(decideCompetencyRequirements);
  const submitAssessment = useServerFn(submitCompetencyAssessment);
  const validateEvidence = useServerFn(validateCompetencyEvidence);
  const decideAssessment = useServerFn(decideCompetencyAssessment);
  const query = useQuery({
    queryKey: ["competency-workspace"],
    queryFn: () => loadWorkspace(),
  });
  const [view, setView] = useState<ViewKey>("overview");
  const [search, setSearch] = useState("");
  const [definitionForm, setDefinitionForm] = useState({
    code: "",
    name: "",
    category: "",
    description: "",
    criteria: "",
    methods: "Direct observation",
    evidenceRequirements: "",
    mandatoryQualification: false,
    levelDefinitions: [...LEVEL_HINTS],
  });
  const [requirementForm, setRequirementForm] = useState({
    jobPositionId: "",
    effectiveFrom: new Date().toISOString().slice(0, 10),
    requirements: [
      {
        competencyDefinitionId: "",
        requiredLevel: "3",
        mandatoryQualification: false,
        qualificationLabel: "",
        assessmentMethod: "Direct observation",
        evidenceRequirement: "",
      },
    ],
  });
  const [assessmentForm, setAssessmentForm] = useState({
    employeeId: "",
    competencyDefinitionId: "",
    assessedLevel: "3",
    assessmentMethod: "Direct observation",
    evidenceNotes: "",
    assessedOn: new Date().toISOString().slice(0, 10),
    nextAssessmentOn: "",
    sourceEvaluationId: "",
    evidenceReference: "",
  });

  const refresh = async (message: string) => {
    await queryClient.invalidateQueries({ queryKey: ["competency-workspace"] });
    toast.success(message);
  };
  const saveDefinitionMutation = useMutation({
    mutationFn: () =>
      saveDefinition({
        data: {
          code: definitionForm.code,
          name: definitionForm.name,
          category: definitionForm.category,
          description: definitionForm.description,
          observableCriteria: parseLines(definitionForm.criteria),
          assessmentMethods: definitionForm.methods
            .split(",")
            .map((method) => method.trim())
            .filter(Boolean),
          evidenceRequirements: parseLines(definitionForm.evidenceRequirements),
          mandatoryQualification: definitionForm.mandatoryQualification,
          levels: definitionForm.levelDefinitions.map((definition, index) => ({
            level: index + 1,
            label: LEVEL_LABELS[index]!,
            definition,
          })),
        },
      }),
    onSuccess: () => refresh("Versioned competency definition saved."),
    onError: (error) => toast.error(error.message),
  });
  const requirementsMutation = useMutation({
    mutationFn: () =>
      createRequirements({
        data: {
          jobPositionId: requirementForm.jobPositionId,
          effectiveFrom: requirementForm.effectiveFrom,
          requirements: requirementForm.requirements.map((requirement) => ({
            competencyDefinitionId: requirement.competencyDefinitionId,
            requiredLevel: Number(requirement.requiredLevel),
            mandatoryQualification: requirement.mandatoryQualification,
            qualificationLabel: requirement.qualificationLabel || null,
            assessmentMethod: requirement.assessmentMethod,
            evidenceRequirement: requirement.evidenceRequirement,
          })),
        },
      }),
    onSuccess: () => refresh("Requirement version submitted for approval."),
    onError: (error) => toast.error(error.message),
  });
  const assessmentMutation = useMutation({
    mutationFn: () =>
      submitAssessment({
        data: {
          employeeId: assessmentForm.employeeId,
          competencyDefinitionId: assessmentForm.competencyDefinitionId,
          isReassessment:
            activeView === "reassess" ||
            (query.data?.assessments.some(
              (assessment) =>
                assessment.employeeId === assessmentForm.employeeId &&
                assessment.competencyDefinitionId === assessmentForm.competencyDefinitionId,
            ) ??
              false),
          assessedLevel: Number(assessmentForm.assessedLevel),
          assessmentMethod: assessmentForm.assessmentMethod,
          evidenceNotes: assessmentForm.evidenceNotes,
          assessedOn: assessmentForm.assessedOn,
          nextAssessmentOn: assessmentForm.nextAssessmentOn || null,
          sourceEvaluationId: assessmentForm.sourceEvaluationId || null,
          sourceAttachmentId: null,
          evidenceReference: assessmentForm.evidenceReference || null,
        },
      }),
    onSuccess: () => refresh("Competency assessment submitted for validation."),
    onError: (error) => toast.error(error.message),
  });
  const decideRequirementMutation = useMutation({
    mutationFn: ({ id, approve }: { id: string; approve: boolean }) =>
      decideRequirements({
        data: {
          id,
          approve,
          reason: approve
            ? null
            : window.prompt("Reason for returning these requirements?")?.trim() || null,
        },
      }),
    onSuccess: () => refresh("Requirement decision recorded."),
    onError: (error) => toast.error(error.message),
  });
  const validateEvidenceMutation = useMutation({
    mutationFn: ({ assessmentId, valid }: { assessmentId: string; valid: boolean }) =>
      validateEvidence({
        data: {
          assessmentId,
          valid,
          reason: valid ? null : window.prompt("What evidence is required?")?.trim() || null,
        },
      }),
    onSuccess: () => refresh("Evidence validation recorded."),
    onError: (error) => toast.error(error.message),
  });
  const decideAssessmentMutation = useMutation({
    mutationFn: ({ id, approve }: { id: string; approve: boolean }) =>
      decideAssessment({
        data: {
          id,
          approve,
          reason: approve
            ? null
            : window.prompt("Reason for returning this assessment?")?.trim() || null,
        },
      }),
    onSuccess: () => refresh("Assessment decision recorded."),
    onError: (error) => toast.error(error.message),
  });

  const currentViews = useMemo(() => (query.data ? viewsForRole(query.data) : []), [query.data]);
  const selectableEmployees = query.data?.employees ?? [];
  const eligibleDefinitions = (query.data?.definitions ?? []).filter((definition) =>
    (query.data?.requirementSets ?? []).some(
      (set) =>
        set.status === "APPROVED" &&
        set.items.some((item) => item.competencyDefinitionId === definition.id),
    ),
  );
  const finalizedEvaluations = (query.data?.finalizedEvaluations ?? []).filter(
    (evaluation) => evaluation.employeeId === assessmentForm.employeeId,
  );

  if (query.isPending) return <LoadingState label="Loading competency management" />;
  if (query.isError) return <ErrorState message={query.error.message} />;
  const data = query.data;
  const activeView = currentViews.some((item) => item.key === view)
    ? view
    : (currentViews[0]?.key ?? "overview");
  const activeSetsByPosition = new Map<
    string,
    CompetencyWorkspaceData["requirementSets"][number]
  >();
  for (const set of data.requirementSets
    .filter(
      (requirementSet) =>
        requirementSet.status === "APPROVED" &&
        requirementSet.effectiveFrom <= new Date().toISOString().slice(0, 10),
    )
    .sort((left, right) => right.version - left.version)) {
    if (!activeSetsByPosition.has(set.positionId)) activeSetsByPosition.set(set.positionId, set);
  }
  const approvedAssessmentByKey = new Map<string, number>();
  for (const assessment of [...data.assessments].sort(
    (left, right) =>
      left.assessedOn.localeCompare(right.assessedOn) || left.version - right.version,
  )) {
    if (assessment.status === "APPROVED") {
      approvedAssessmentByKey.set(
        `${assessment.employeeId}:${assessment.competencyDefinitionId}`,
        assessment.assessedLevel,
      );
    }
  }
  const matrixRows = data.employees.flatMap((employee) => {
    const activeSet = employee.positionId
      ? activeSetsByPosition.get(employee.positionId)
      : undefined;
    return (activeSet?.items ?? []).map((item) => ({
      employee,
      item,
      current: approvedAssessmentByKey.get(`${employee.id}:${item.competencyDefinitionId}`) ?? null,
    }));
  });
  const unassessedCount = new Set(
    matrixRows.filter((row) => row.current === null).map((row) => row.employee.id),
  ).size;
  const openNumericGaps = matrixRows.filter(
    (row) => row.current !== null && row.current < row.item.requiredLevel,
  ).length;
  const openMandatoryQualifications = matrixRows.filter(
    (row) =>
      row.item.mandatoryQualification &&
      (row.current === null || row.current < row.item.requiredLevel),
  ).length;
  const pendingAssessments = data.assessments.filter(
    (assessment) => assessment.status === "SUBMITTED",
  );

  function onSubmit(event: FormEvent<HTMLFormElement>, submit: () => void) {
    event.preventDefault();
    submit();
  }

  return (
    <div className="space-y-6">
      <PageHeader
        breadcrumbs={["Competency Management"]}
        title={
          data.role === "EMPLOYEE"
            ? "My Competencies"
            : `${data.role.replaceAll("_", " ")} Competency Management`
        }
        description="Versioned job requirements, evidence-based assessments, and scoped competency gaps. Performance scores and course completion do not set competency levels."
      />
      <div
        className="flex flex-wrap gap-2"
        role="tablist"
        aria-label="Competency management sections"
      >
        {currentViews.map((item) => (
          <Button
            key={item.key}
            size="sm"
            variant={activeView === item.key ? "default" : "outline"}
            role="tab"
            aria-selected={activeView === item.key}
            onClick={() => {
              setView(item.key);
              setSearch("");
            }}
          >
            {item.label}
          </Button>
        ))}
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <SummaryCard label="Employees in authorized scope" value={data.employees.length} />
        <SummaryCard
          label="Competency definitions"
          value={data.definitions.filter((item) => item.active).length}
        />
        <SummaryCard label="Assessments awaiting review" value={pendingAssessments.length} />
        <SummaryCard label="Employees with unassessed requirements" value={unassessedCount} />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <SummaryCard
          label="Open numeric competency gaps"
          value={openNumericGaps}
          description="Calculated only from approved assessments and approved position requirements."
        />
        <SummaryCard
          label="Outstanding mandatory qualifications"
          value={openMandatoryQualifications}
          description="Tracked separately from numeric competency gaps."
        />
      </div>

      {activeView === "library" && data.permissions.manageFramework ? (
        <Card>
          <CardHeader>
            <CardTitle>Create a versioned competency definition</CardTitle>
          </CardHeader>
          <CardContent>
            <form
              className="grid gap-4 md:grid-cols-2"
              onSubmit={(event) => onSubmit(event, () => saveDefinitionMutation.mutate())}
            >
              <label className={fieldClass()}>
                Code
                <Input
                  required
                  minLength={2}
                  value={definitionForm.code}
                  onChange={(event) =>
                    setDefinitionForm({
                      ...definitionForm,
                      code: event.currentTarget.value.toUpperCase(),
                    })
                  }
                />
              </label>
              <label className={fieldClass()}>
                Name
                <Input
                  required
                  value={definitionForm.name}
                  onChange={(event) =>
                    setDefinitionForm({ ...definitionForm, name: event.currentTarget.value })
                  }
                />
              </label>
              <label className={fieldClass()}>
                Category
                <Input
                  required
                  value={definitionForm.category}
                  onChange={(event) =>
                    setDefinitionForm({ ...definitionForm, category: event.currentTarget.value })
                  }
                />
              </label>
              <label className={fieldClass()}>
                Description
                <Input
                  required
                  value={definitionForm.description}
                  onChange={(event) =>
                    setDefinitionForm({ ...definitionForm, description: event.currentTarget.value })
                  }
                />
              </label>
              <label className={`${fieldClass()} md:col-span-2`}>
                Observable criteria (one per line)
                <Textarea
                  required
                  value={definitionForm.criteria}
                  onChange={(event) =>
                    setDefinitionForm({ ...definitionForm, criteria: event.currentTarget.value })
                  }
                />
              </label>
              <label className={fieldClass()}>
                Assessment methods (comma separated)
                <Input
                  required
                  value={definitionForm.methods}
                  onChange={(event) =>
                    setDefinitionForm({ ...definitionForm, methods: event.currentTarget.value })
                  }
                />
              </label>
              <label className={fieldClass()}>
                Evidence requirements (one per line)
                <Textarea
                  required
                  value={definitionForm.evidenceRequirements}
                  onChange={(event) =>
                    setDefinitionForm({
                      ...definitionForm,
                      evidenceRequirements: event.currentTarget.value,
                    })
                  }
                />
              </label>
              <div className="space-y-2 md:col-span-2">
                <p className="text-sm font-medium">
                  Observable proficiency descriptions (all five levels required)
                </p>
                {definitionForm.levelDefinitions.map((definition, index) => (
                  <label
                    key={index}
                    className="grid gap-2 sm:grid-cols-[160px_1fr] sm:items-center"
                  >
                    <span className="text-sm">
                      {index + 1} — {LEVEL_LABELS[index]}
                    </span>
                    <Input
                      required
                      minLength={5}
                      value={definition}
                      onChange={(event) => {
                        const levelDefinitions = [...definitionForm.levelDefinitions];
                        levelDefinitions[index] = event.currentTarget.value;
                        setDefinitionForm({ ...definitionForm, levelDefinitions });
                      }}
                    />
                  </label>
                ))}
              </div>
              <label className="flex items-center gap-2 text-sm md:col-span-2">
                <input
                  type="checkbox"
                  checked={definitionForm.mandatoryQualification}
                  onChange={(event) =>
                    setDefinitionForm({
                      ...definitionForm,
                      mandatoryQualification: event.currentTarget.checked,
                    })
                  }
                />
                This competency also tracks a mandatory qualification separately from numeric gaps.
              </label>
              <Button
                type="submit"
                disabled={saveDefinitionMutation.isPending}
                className="md:col-span-2"
              >
                Save new competency version
              </Button>
            </form>
          </CardContent>
        </Card>
      ) : null}

      {activeView === "requirements" && data.permissions.manageRequirements ? (
        <Card>
          <CardHeader>
            <CardTitle>Submit a position requirement version</CardTitle>
          </CardHeader>
          <CardContent>
            {data.positions.length && data.definitions.length ? (
              <form
                className="grid gap-4 md:grid-cols-2"
                onSubmit={(event) => onSubmit(event, () => requirementsMutation.mutate())}
              >
                <SelectField
                  label="Job position"
                  required
                  value={requirementForm.jobPositionId}
                  onChange={(jobPositionId) =>
                    setRequirementForm({ ...requirementForm, jobPositionId })
                  }
                >
                  <option value="">Select a position</option>
                  {data.positions.map((position) => (
                    <option key={position.id} value={position.id}>
                      {position.name}
                    </option>
                  ))}
                </SelectField>
                <label className={fieldClass()}>
                  Effective date
                  <Input
                    required
                    type="date"
                    value={requirementForm.effectiveFrom}
                    onChange={(event) =>
                      setRequirementForm({
                        ...requirementForm,
                        effectiveFrom: event.currentTarget.value,
                      })
                    }
                  />
                </label>
                <div className="space-y-4 md:col-span-2">
                  {requirementForm.requirements.map((requirement, index) => (
                    <fieldset
                      key={index}
                      className="grid gap-4 rounded-lg border border-border p-4 md:grid-cols-2"
                    >
                      <legend className="px-2 text-sm font-medium">
                        Required competency {index + 1}
                      </legend>
                      <SelectField
                        label="Competency"
                        required
                        value={requirement.competencyDefinitionId}
                        onChange={(competencyDefinitionId) => {
                          const requirements = [...requirementForm.requirements];
                          requirements[index] = { ...requirement, competencyDefinitionId };
                          setRequirementForm({ ...requirementForm, requirements });
                        }}
                      >
                        <option value="">Select a competency</option>
                        {data.definitions
                          .filter(
                            (definition) =>
                              definition.active &&
                              !requirementForm.requirements.some(
                                (other, otherIndex) =>
                                  otherIndex !== index &&
                                  other.competencyDefinitionId === definition.id,
                              ),
                          )
                          .map((definition) => (
                            <option key={definition.id} value={definition.id}>
                              {definition.name} (v{definition.version})
                            </option>
                          ))}
                      </SelectField>
                      <SelectField
                        label="Required proficiency level"
                        required
                        value={requirement.requiredLevel}
                        onChange={(requiredLevel) => {
                          const requirements = [...requirementForm.requirements];
                          requirements[index] = { ...requirement, requiredLevel };
                          setRequirementForm({ ...requirementForm, requirements });
                        }}
                      >
                        {LEVEL_LABELS.map((label, levelIndex) => (
                          <option key={label} value={levelIndex + 1}>
                            {levelIndex + 1} — {label}
                          </option>
                        ))}
                      </SelectField>
                      <label className={fieldClass()}>
                        Assessment method
                        <Input
                          required
                          value={requirement.assessmentMethod}
                          onChange={(event) => {
                            const requirements = [...requirementForm.requirements];
                            requirements[index] = {
                              ...requirement,
                              assessmentMethod: event.currentTarget.value,
                            };
                            setRequirementForm({ ...requirementForm, requirements });
                          }}
                        />
                      </label>
                      <label className={fieldClass()}>
                        Evidence requirement
                        <Input
                          required
                          value={requirement.evidenceRequirement}
                          onChange={(event) => {
                            const requirements = [...requirementForm.requirements];
                            requirements[index] = {
                              ...requirement,
                              evidenceRequirement: event.currentTarget.value,
                            };
                            setRequirementForm({ ...requirementForm, requirements });
                          }}
                        />
                      </label>
                      <label className="flex items-center gap-2 text-sm md:col-span-2">
                        <input
                          type="checkbox"
                          checked={requirement.mandatoryQualification}
                          onChange={(event) => {
                            const requirements = [...requirementForm.requirements];
                            requirements[index] = {
                              ...requirement,
                              mandatoryQualification: event.currentTarget.checked,
                            };
                            setRequirementForm({ ...requirementForm, requirements });
                          }}
                        />
                        Mandatory / safety-critical qualification (tracked separately from numeric
                        gap)
                      </label>
                      {requirement.mandatoryQualification ? (
                        <label className={`${fieldClass()} md:col-span-2`}>
                          Qualification name
                          <Input
                            required
                            value={requirement.qualificationLabel}
                            onChange={(event) => {
                              const requirements = [...requirementForm.requirements];
                              requirements[index] = {
                                ...requirement,
                                qualificationLabel: event.currentTarget.value,
                              };
                              setRequirementForm({ ...requirementForm, requirements });
                            }}
                          />
                        </label>
                      ) : null}
                      {requirementForm.requirements.length > 1 ? (
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() =>
                            setRequirementForm({
                              ...requirementForm,
                              requirements: requirementForm.requirements.filter(
                                (_, itemIndex) => itemIndex !== index,
                              ),
                            })
                          }
                        >
                          Remove competency
                        </Button>
                      ) : null}
                    </fieldset>
                  ))}
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() =>
                      setRequirementForm({
                        ...requirementForm,
                        requirements: [
                          ...requirementForm.requirements,
                          {
                            competencyDefinitionId: "",
                            requiredLevel: "3",
                            mandatoryQualification: false,
                            qualificationLabel: "",
                            assessmentMethod: "Direct observation",
                            evidenceRequirement: "",
                          },
                        ],
                      })
                    }
                    disabled={
                      requirementForm.requirements.length >=
                      data.definitions.filter((definition) => definition.active).length
                    }
                  >
                    Add competency to version
                  </Button>
                </div>
                <Button
                  type="submit"
                  disabled={requirementsMutation.isPending}
                  className="md:col-span-2"
                >
                  Submit new requirement version for approval
                </Button>
              </form>
            ) : (
              <EmptyState
                title="Requirements cannot be created yet"
                description="The HR account needs existing job positions and at least one active competency definition."
              />
            )}
          </CardContent>
        </Card>
      ) : null}

      {(["assess", "reassess"].includes(activeView) && data.permissions.assess) ||
      (activeView === "reassess" && data.permissions.reassess) ? (
        <Card>
          <CardHeader>
            <CardTitle>
              {activeView === "reassess"
                ? "Competency reassessment"
                : "Evidence-based competency assessment"}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {selectableEmployees.length && eligibleDefinitions.length ? (
              <form
                className="grid gap-4 md:grid-cols-2"
                onSubmit={(event) => onSubmit(event, () => assessmentMutation.mutate())}
              >
                <SelectField
                  label="Employee"
                  required
                  value={assessmentForm.employeeId}
                  onChange={(employeeId) =>
                    setAssessmentForm({ ...assessmentForm, employeeId, sourceEvaluationId: "" })
                  }
                >
                  <option value="">Select an assigned employee</option>
                  {selectableEmployees.map((employee) => (
                    <option key={employee.id} value={employee.id}>
                      {employee.name} · {employee.number} · {employee.position}
                    </option>
                  ))}
                </SelectField>
                <SelectField
                  label="Competency"
                  required
                  value={assessmentForm.competencyDefinitionId}
                  onChange={(competencyDefinitionId) =>
                    setAssessmentForm({ ...assessmentForm, competencyDefinitionId })
                  }
                >
                  <option value="">Select an approved required competency</option>
                  {eligibleDefinitions.map((definition) => (
                    <option key={definition.id} value={definition.id}>
                      {definition.name}
                    </option>
                  ))}
                </SelectField>
                <SelectField
                  label="Assessed current level"
                  required
                  value={assessmentForm.assessedLevel}
                  onChange={(assessedLevel) =>
                    setAssessmentForm({ ...assessmentForm, assessedLevel })
                  }
                >
                  {LEVEL_LABELS.map((label, index) => (
                    <option key={label} value={index + 1}>
                      {index + 1} — {label}
                    </option>
                  ))}
                </SelectField>
                <label className={fieldClass()}>
                  Assessment method
                  <Input
                    required
                    value={assessmentForm.assessmentMethod}
                    onChange={(event) =>
                      setAssessmentForm({
                        ...assessmentForm,
                        assessmentMethod: event.currentTarget.value,
                      })
                    }
                  />
                </label>
                <label className={fieldClass()}>
                  Assessment date
                  <Input
                    required
                    type="date"
                    value={assessmentForm.assessedOn}
                    onChange={(event) =>
                      setAssessmentForm({
                        ...assessmentForm,
                        assessedOn: event.currentTarget.value,
                      })
                    }
                  />
                </label>
                <label className={fieldClass()}>
                  Next assessment date
                  <Input
                    type="date"
                    value={assessmentForm.nextAssessmentOn}
                    onChange={(event) =>
                      setAssessmentForm({
                        ...assessmentForm,
                        nextAssessmentOn: event.currentTarget.value,
                      })
                    }
                  />
                </label>
                <label className={`${fieldClass()} md:col-span-2`}>
                  Evidence notes
                  <Textarea
                    required
                    minLength={10}
                    value={assessmentForm.evidenceNotes}
                    onChange={(event) =>
                      setAssessmentForm({
                        ...assessmentForm,
                        evidenceNotes: event.currentTarget.value,
                      })
                    }
                  />
                </label>
                <SelectField
                  label="Related finalized performance evaluation (optional)"
                  value={assessmentForm.sourceEvaluationId}
                  onChange={(sourceEvaluationId) =>
                    setAssessmentForm({ ...assessmentForm, sourceEvaluationId })
                  }
                >
                  <option value="">No linked performance evaluation</option>
                  {finalizedEvaluations.map((evaluation) => (
                    <option key={evaluation.id} value={evaluation.id}>
                      {evaluation.period}
                    </option>
                  ))}
                </SelectField>
                <label className={fieldClass()}>
                  Evidence reference (optional)
                  <Input
                    value={assessmentForm.evidenceReference}
                    onChange={(event) =>
                      setAssessmentForm({
                        ...assessmentForm,
                        evidenceReference: event.currentTarget.value,
                      })
                    }
                  />
                </label>
                <p className="text-xs text-muted-foreground md:col-span-2">
                  Only finalized evaluations for this employee can be linked. Their performance
                  score is never converted into a competency rating. Submission creates an immutable
                  assessment version requiring evidence validation and review.
                </p>
                <Button
                  type="submit"
                  disabled={assessmentMutation.isPending}
                  className="md:col-span-2"
                >
                  Submit assessment
                </Button>
              </form>
            ) : (
              <EmptyState
                title="No assessable competency requirements"
                description="Employees in your authorized scope need approved job competency requirements before an assessment can be recorded."
              />
            )}
          </CardContent>
        </Card>
      ) : null}

      <CompetencyTable
        data={data}
        view={activeView}
        search={search}
        onSearch={setSearch}
        onValidate={(assessmentId, valid) =>
          validateEvidenceMutation.mutate({ assessmentId, valid })
        }
        onDecide={(id, approve) => {
          if (activeView === "requirements") decideRequirementMutation.mutate({ id, approve });
          else decideAssessmentMutation.mutate({ id, approve });
        }}
      />

      {activeView === "reassess" && !data.permissions.reassess ? (
        <EmptyState
          title="Reassessment permission required"
          description="Operations Managers need an explicit reassessment permission grant before submitting or changing competency results."
        />
      ) : null}
    </div>
  );
}
