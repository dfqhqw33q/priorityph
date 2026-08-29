// Client-safe domain constants and types shared by UI, validation and server code.

export const APP_NAME = "Priority Handling Logistics, Inc.";

export const APP_ROLES = ["ADMINISTRATOR", "PRESIDENT", "HR", "SUPERVISOR", "REVIEWING_SUPERVISOR", "COMMITTEE"] as const;
export type AppRole = (typeof APP_ROLES)[number];

export const ROLE_LABELS: Record<AppRole, string> = {
  ADMINISTRATOR: "Administrator",
  PRESIDENT: "President",
  HR: "HR/Personnel",
  SUPERVISOR: "Supervisor",
  REVIEWING_SUPERVISOR: "Reviewing Supervisor / Division Head",
  COMMITTEE: "Performance Evaluation Committee",
};

export const PERMISSIONS = [
  "users.view",
  "users.manage",
  "users.assign_roles",
  "users.reset_password",
  "users.revoke_sessions",
  "roles.manage",
  "permissions.manage",
  "employees.view",
  "employees.manage",
  "evaluations.step2",
  "evaluations.review_step3",
  "personnel.process",
  "committee.review",
  "president.approve",
  "templates.manage",
  "cycles.view",
  "cycles.manage",
  "cycles.manage_link",
  "evaluations.view_step1",
  "evaluations.rate_supervisor",
  "evaluations.submit_president",
  "evaluations.reopen_supervisor",
  "evaluations.view_history",
  "president.view",
  "president.step2",
  "president.step3",
  "evaluations.finalize",
  "reports.view",
  "audit.view",
  "scoring.manage",
  "scores.view",
  "evaluations.correct",
] as const;
export type Permission = (typeof PERMISSIONS)[number];

/**
 * Human-readable labels for permission codes. The database keeps the raw
 * `module.action` codes; only the presentation layer uses these labels.
 */
export const PERMISSION_LABELS: Record<Permission, string> = {
  "users.view": "View Users",
  "users.manage": "Manage Users",
  "users.assign_roles": "Assign User Roles",
  "users.reset_password": "Reset User Passwords",
  "users.revoke_sessions": "Revoke User Sessions",
  "roles.manage": "Manage Roles",
  "permissions.manage": "Manage Permissions",
  "employees.view": "View Employee Records",
  "employees.manage": "Manage Employee Profiles",
  "evaluations.step2": "Complete Rater Step 2",
  "evaluations.review_step3": "Complete Reviewing Supervisor Step 3",
  "personnel.process": "Process Personnel Information",
  "committee.review": "Review And Recommend Final Action",
  "president.approve": "Approve Or Return Evaluations",
  "templates.manage": "Manage Evaluation Templates",
  "cycles.view": "View Evaluation Cycles",
  "cycles.manage": "Manage Evaluation Cycles",
  "cycles.manage_link": "Manage Assessment Links",
  "evaluations.view_step1": "View Step 1 Submissions",
  "evaluations.rate_supervisor": "Provide Supervisor Ratings",
  "evaluations.submit_president": "Submit To Reviewing Supervisor",
  "evaluations.reopen_supervisor": "Reopen Supervisor Review",
  "evaluations.view_history": "View Evaluation History",
  "president.view": "View President Review",
  "president.step2": "Complete Step 2",
  "president.step3": "Complete Step 3",
  "evaluations.finalize": "Finalize Evaluations",
  "reports.view": "View Reports",
  "audit.view": "View Audit Logs",
  "scoring.manage": "Manage Scoring Rules",
  "scores.view": "View Scores",
  "evaluations.correct": "Return Evaluations For Correction",
};

/** Falls back to a readable rendering for codes that have no explicit label. */
export function permissionLabel(code: string): string {
  return (
    PERMISSION_LABELS[code as Permission] ??
    code
      .split(".")
      .reverse()
      .join(" ")
      .replace(/[_.]/g, " ")
      .replace(/\b\w/g, (character) => character.toUpperCase())
  );
}

/**
 * Turns database enum-style tokens (`DOCUMENT_DOWNLOADED`) into readable text
 * (`DOCUMENT DOWNLOADED`) for audit logs and timelines. Stored values are
 * never changed.
 */
export function humanizeToken(value: string | null | undefined): string {
  if (!value) return "—";
  return value.replace(/_/g, " ").trim();
}


export const CYCLE_STATUSES = ["DRAFT", "ACTIVE", "CLOSED", "DISABLED"] as const;
export type CycleStatus = (typeof CYCLE_STATUSES)[number];

export const EVALUATION_STATUSES = [
  "EMPLOYEE_SUBMITTED",
  "SUPERVISOR_DRAFT",
  "SUPERVISOR_SUBMITTED",
  "REVIEWING_SUPERVISOR_REVIEW",
  "PERSONNEL_PROCESSING",
  "COMMITTEE_REVIEW",
  "PRESIDENT_APPROVAL",
  "RESUBMITTED",
  "PRESIDENT_REVIEW",
  "PRESIDENT_SUBMITTED",
  "READY_FOR_FINALIZATION",
  "RETURNED_FOR_CORRECTION",
  "FINALIZED",
] as const;
export type EvaluationStatus = (typeof EVALUATION_STATUSES)[number];

export const EVALUATION_STATUS_LABELS: Record<EvaluationStatus, string> = {
  EMPLOYEE_SUBMITTED: "Waiting for supervisor",
  SUPERVISOR_DRAFT: "Supervisor in progress",
  SUPERVISOR_SUBMITTED: "Supervisor submitted",
  REVIEWING_SUPERVISOR_REVIEW: "Awaiting Reviewing Supervisor",
  PERSONNEL_PROCESSING: "Personnel processing",
  COMMITTEE_REVIEW: "Committee review",
  PRESIDENT_APPROVAL: "President approval",
  RESUBMITTED: "Resubmitted for review",
  PRESIDENT_REVIEW: "Needs President review",
  PRESIDENT_SUBMITTED: "President review completed",
  READY_FOR_FINALIZATION: "Ready to finalize",
  RETURNED_FOR_CORRECTION: "Returned for correction",
  FINALIZED: "Finalized",
};

export type EvaluatorType = "EMPLOYEE" | "SUPERVISOR" | "REVIEWING_SUPERVISOR" | "PRESIDENT";

export const RATING_SCALE = [
  { value: 1, label: "Poor" },
  { value: 2, label: "Below Average" },
  { value: 3, label: "Average" },
  { value: 4, label: "Above Average" },
  { value: 5, label: "Excellent" },
] as const;

export const OFFICIAL_TEMPLATE_ID = "11111111-1111-4111-8111-111111111111";

export type Criterion = {
  id: string;
  letter: string;
  title: string;
  description: string;
  position: number;
};

export type PublicCycleInfo = {
  cycleId: string;
  name: string;
  year: number;
  instructions: string;
  criteria: Criterion[];
};

export type CycleSummary = {
  id: string;
  name: string;
  year: number;
  status: CycleStatus;
  starts_at: string;
  ends_at: string;
  cycle_token: string | null;
  template_id: string;
  instructions: string;
  created_at: string;
  updated_at: string;
  step1_count: number;
  supervisor_count: number;
  president_count: number;
};

export type EvaluationListItem = {
  id: string;
  status: EvaluationStatus;
  employee_number_snapshot: string;
  full_name_snapshot: string;
  job_title_snapshot: string;
  division_snapshot: string;
  section_snapshot: string;
  employee_submitted_at: string | null;
  supervisor_submitted_at: string | null;
  cycle_name: string;
  cycle_year: number;
};

export type RatingRow = {
  criterion_id: string;
  evaluator_type: EvaluatorType;
  rating: number;
  is_locked: boolean;
};

export type EvaluationDetail = EvaluationListItem & {
  supervisor_remarks: string;
  version: number;
  criteria: Criterion[];
  ratings: RatingRow[];
  supervisor_user_id: string | null;
  supervisor_name: string | null;
  president_step2_submitted_at: string | null;
  president_step3_submitted_at: string | null;
  is_finalized: boolean;
  cycle_instructions: string;
  finalized_at: string | null;
};

export const PRESIDENT_INPUT_TYPES = ["TEXT", "LONG_TEXT", "SINGLE_CHOICE", "YES_NO"] as const;
export type PresidentInputType = (typeof PRESIDENT_INPUT_TYPES)[number];

export type PresidentStepItem = {
  id: string;
  position: number;
  code: string;
  label: string;
  help_text: string;
  input_type: PresidentInputType;
  options: string[];
  is_required: boolean;
};

export type PresidentStepData = {
  step: 2 | 3;
  templateId: string;
  title: string;
  description: string;
  items: PresidentStepItem[];
  answers: Record<string, string>;
  isLocked: boolean;
  submittedAt: string | null;
};

export type QueueFilters = {
  search?: string;
  year?: number | null;
  division?: string;
  section?: string;
  status?: EvaluationStatus | null;
};

export function roleLandingPath(roles: AppRole[]): string {
  if (roles.includes("HR")) return "/hr/cycles";
  if (roles.includes("SUPERVISOR")) return "/supervisor";
  if (roles.includes("REVIEWING_SUPERVISOR")) return "/reviewing-supervisor";
  if (roles.includes("COMMITTEE")) return "/committee";
  if (roles.includes("PRESIDENT")) return "/president";
  if (roles.includes("ADMINISTRATOR")) return "/admin";
  return "/unauthorized";
}

// ---------------------------------------------------------------------------
// Phase 8 — approved scoring configuration and calculated results
// ---------------------------------------------------------------------------

export const SCORING_RULE_STATUSES = ["DRAFT", "ACTIVE", "RETIRED"] as const;
export type ScoringRuleStatus = (typeof SCORING_RULE_STATUSES)[number];

export const WEIGHTING_MODES = ["EQUAL", "WEIGHTED"] as const;
export type WeightingMode = (typeof WEIGHTING_MODES)[number];

export const CALCULATION_STATUSES = ["PENDING", "CALCULATED", "INVALID"] as const;
export type CalculationStatus = (typeof CALCULATION_STATUSES)[number];

export type ScoringBand = { id?: string; label: string; minScore: number; maxScore: number };
export type ScoringFactorWeight = { criterionId: string; weight: number };

export type ScoringRule = {
  id: string;
  name: string;
  version: number;
  templateId: string;
  status: ScoringRuleStatus;
  factorWeighting: WeightingMode;
  requiredFactorWeightTotal: number;
  employeeWeight: number;
  supervisorWeight: number;
  roundingDecimals: number;
  showEmployeeAverage: boolean;
  showSupervisorAverage: boolean;
  showPresidentResult: boolean;
  notes: string;
  activatedAt: string | null;
  createdAt: string;
  weights: ScoringFactorWeight[];
  bands: ScoringBand[];
};

export type EvaluationScore = {
  evaluationId: string;
  ruleId: string | null;
  ruleVersion: number | null;
  employeeAverage: number | null;
  supervisorAverage: number | null;
  presidentAverage: number | null;
  finalScore: number | null;
  finalRatingLabel: string | null;
  calculationStatus: CalculationStatus;
  calculationNotes: string;
  isLocked: boolean;
  calculatedAt: string | null;
};

export const NOTIFICATION_EVENT_TYPES = [
  "EMPLOYEE_STEP1_SUBMITTED",
  "SUPERVISOR_SUBMISSION_REQUIRED",
  "SUPERVISOR_SUBMITTED_TO_PRESIDENT",
  "PRESIDENT_STEP2_REQUIRED",
  "PRESIDENT_STEP3_REQUIRED",
  "EVALUATION_FINALIZED",
  "EVALUATION_RETURNED_FOR_CORRECTION",
] as const;
export type NotificationEventType = (typeof NOTIFICATION_EVENT_TYPES)[number];

/** Rounds to a fixed number of decimals without accumulating float drift. */
export function roundTo(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}
