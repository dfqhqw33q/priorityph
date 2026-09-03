# Final System Design Gap Analysis

## Purpose

This document compares the implementation in this repository with `FINAL_SYSTEM_DESIGN_UPDATED.docx`. It is an implementation reference, not a product summary. Statements under **Already Implemented** are supported by the current source tree, server functions, database migrations, or generated route tree. Statements under the other status categories identify the work needed to align the implementation with the Final System Design.

## Analysis Scope

Reviewed areas:

- React routes and shared UI components in `src/`
- TanStack Start server functions in `src/lib/`
- Supabase clients, authentication middleware, schemas, and domain types
- PostgreSQL migrations in `supabase/migrations/`
- Current workflow statuses, role and permission constants, scoring, AI, reporting, and documents
- `FINAL_SYSTEM_DESIGN_UPDATED.docx`, including its six-module model and end-to-end workflow

## Status Labels

| Label | Meaning |
| --- | --- |
| **Already Implemented** | Exists in the current implementation and aligns with the Final System Design. |
| **Missing** | Required by the Final System Design but absent from the current implementation. |
| **Needs to Be Implemented** | A missing requirement that should be built as a concrete development work item. |
| **Needs Adjustment/Modification** | Exists, but its behavior, data model, authorization, or workflow differs from the design. |
| **Needs to Be Removed** | Existing behavior conflicts with the Final System Design or should no longer be used. |
| **Needs to Be Created** | A new component, entity, role, function, or workflow boundary required by the design. |
| **Needs Clarification** | The design and implementation do not provide enough detail to make a safe implementation decision. |

## Executive Summary

The current system is a functioning evaluation workflow centered on four authenticated roles: Administrator, President, HR, and Supervisor. It supports cycle management, public Step 1 submission, supervisor review, President review, scoring, finalization, reports/history, documents, audit events, and advisory AI assistance.

The Final System Design expands that scope into one integrated Performance and Development HR System. It requires the annual evaluation to become the source of competency, learning, training, succession, recognition, performance-history, and digital 201-file data. It also introduces Reviewing Supervisor/Division Head, Personnel Office, Performance Evaluation Committee, Employee/Ratee profile verification, and Customer feedback as first-class system participants or modules.

The highest-priority gaps are:

1. Replace public employee-profile auto-creation and profile overwriting with authorized master-profile creation and public profile verification.
2. Add the Reviewing Supervisor/Division Head, Personnel Office, and Committee stages and their approval transitions.
3. Add employee e-signatures at the required workflow stages and define signature storage/verification.
4. Add the six required supporting modules and their links to finalized evaluations and the employee 201 file.
5. Align role and permission design with the expanded participant model.
6. Resolve scoring, correction, finalization transaction, and authorization gaps before extending the workflow.

---

## 1. System Concept And Scope

### Already Implemented

| Current implementation | Final System Design requirement | Gap | Recommended action |
| --- | --- | --- | --- |
| The application has an annual evaluation workflow with cycle management, public Step 1, supervisor review, President review, scoring, finalization, history, reports, and documents. | One integrated Performance and Development HR System uses the annual evaluation as the primary source for supporting HR modules. | The current implementation is evaluation-centered; supporting development modules are not present as complete modules. | Retain the evaluation foundation and extend finalized-evaluation events into competency, learning, training, succession, recognition, performance history, and the digital 201 file. |
| Evaluation criteria are template-driven and the seeded official template contains ten factors. | A–J ratings serve as competency indicators. | The factors are used for ratings and scoring, but there is no competency-profile or competency-gap module. | Reuse `evaluation_criteria` and stored ratings as competency source data; create derived competency results and gap records. |
| AI functions analyze ratings and produce development/training-oriented text. | Gemini 2.5 Flash operates within the development portion of the evaluation. | AI is available in the President review area and is advisory, but the design places the analysis after employee and Rater data and before completion of the Rater development section. | Move or expose the AI interaction in the Rater/Step 2 workflow after both relevant rating sets and development context are available. Preserve advisory controls. |

### Needs Clarification

| Area | Current state | Design ambiguity | Decision required |
| --- | --- | --- | --- |
| Product boundary | The repository README and routes describe an evaluation system; the Final System Design describes a broader HR platform. | The document calls the six modules required, but does not define which module capabilities are in the first release or their complete field sets. | Confirm whether all six modules are mandatory for the next implementation increment or whether delivery will be phased. |
| Customer feedback | The design lists Customer as a participant and references an existing customer portal. No customer route or customer integration is present in this repository. | It is unclear whether the existing portal is external and only needs an integration, or must be implemented here. | Identify the existing customer portal, its API/authentication contract, data ownership, and required feedback fields. |
| Naming | Current role is `SUPERVISOR`; design distinguishes Immediate Supervisor/Rater and Reviewing Supervisor/Division Head. | It is unclear whether the existing Supervisor role maps only to the Immediate Supervisor/Rater or can also act as Division Head. | Define separate role codes and assignment rules before schema changes. |

---

## 2. User Roles And Permissions

### Already Implemented

| Current implementation | Final System Design requirement | Gap | Recommended action |
| --- | --- | --- | --- |
| `APP_ROLES` defines `ADMINISTRATOR`, `PRESIDENT`, `HR`, and `SUPERVISOR` in `src/lib/domain.ts`. | The design identifies HR/Personnel, Employee/Ratee, Immediate Supervisor/Rater, Reviewing Supervisor/Division Head, Performance Evaluation Committee, President, System Administrator, and Customer. | Three internal workflow roles are absent: Reviewing Supervisor/Division Head, Personnel Office, and Committee. Employee/Ratee and Customer are not modeled as application roles. | Add explicit role and actor models after confirming whether Personnel and HR share one role and whether Committee members need individual accounts. |
| Permission codes cover users, roles, employees, templates, cycles, evaluation stages, President steps, scoring, reports, and audit. | Each design participant must access only the functions belonging to its stage. | No permission set exists for Step 3 reviewing supervisor, personnel processing, committee recommendation, learning, training, succession, recognition, or customer feedback. | Add least-privilege permissions by module and action, then seed role-permission mappings in a forward-only migration. |
| `requireSupabaseAuth`, `requirePermission`, and `requirePermissionAny` provide server-side checks. The UI also checks access in `AppShell`. | Authentication and authorization must protect each workflow stage. | Some server functions have weaker checks than the UI; `getDashboardStats` lacks a permission check, and mandatory password change is not enforced by server authorization. | Treat server-side checks as authoritative. Add account usability and password-state checks to protected server functions and audit direct invocation tests. |
| The database protects the last active Administrator through triggers. | System Administrator must manage users, roles, permissions, configuration, and audit logs. | Administrator coverage exists, but system configuration and evaluation configuration surfaces are incomplete. | Add explicit configuration routes and permissions only for design-confirmed configuration areas. |

### Needs to Be Implemented

1. Add a Reviewing Supervisor/Division Head role or an explicit assignment model with permissions for Step 3 review, comments, recommendations, signature, and submission.
2. Add Personnel Office permissions for personnel information, salary data, total points, adjective rating, increase/bonus recommendation, and submission.
3. Add Committee permissions for complete-file review and final action recommendation.
4. Add role-aware queue and dashboard views for each new stage.
5. Add Customer identity and feedback permissions only after the external-portal boundary is clarified.
6. Enforce one intended role model consistently. The UI schemas suggest one role per user, while `user_roles` currently permits multiple role rows per user.

### Needs Adjustment/Modification

| Current behavior | Design requirement | Recommended action |
| --- | --- | --- |
| Every authorized Supervisor can see all eligible Step 1 submissions. There is no assignment restriction. | The design names the Immediate Supervisor/Rater and Reviewing Supervisor/Division Head, which implies workflow responsibility, but does not define how employees are assigned to each person. | Preserve the no-assignment restriction only if it is still a deliberate business rule. Otherwise create explicit rater/reviewer assignments and clarify whether queues are global or assigned. |
| President access currently covers President review, steps, scores, finalization, and correction. | President approves the final action after Committee recommendation. | Keep President review but move final approval after Committee and Personnel stages in the state machine. |
| HR handles cycles, employee records, history, and reports. | HR/Personnel also owns personnel processing and employee master profiles. | Either extend the HR role or create a separate Personnel role; document the decision and enforce it in server functions. |

### Needs to Be Removed

| Existing item | Reason |
| --- | --- |
| Any implicit assumption that the four current roles are the complete role model | It conflicts with the Final System Design participant list and would prevent stage-specific authorization. |
| UI-only role enforcement for sensitive workflow actions | It is not sufficient for direct server-function calls and should be replaced by server-enforced authorization. |

---

## 3. Public Portal, Profile Verification, And Employee Records

### Already Implemented

| Current implementation | Final System Design requirement | Gap | Recommended action |
| --- | --- | --- | --- |
| `/evaluation/:cycleToken` is public and `getPublicCycle`/`submitStep1` do not require authentication. | Employees access Step 1 through a shared QR/link without permanent employee accounts. | The access model aligns. | Retain token-based public access, cycle status checks, date checks, and no employee login account. |
| The public form collects employee number, name, job title, division, section, and A–J ratings. | The employee enters/confirms identifying information before profile verification and evaluation. | Current name fields are not represented as the design’s separate first, middle, and last name verification fields. | Extend the employee identity schema and UI to support the required verification fields. |
| `employees` is a persistent table and `evaluations` links to an employee and cycle. | Employee Profile is persistent master data; each annual evaluation links to the existing profile and preserves history. | The relationship exists, but its creation and update rules violate the design. | Retain the relationship and change profile lifecycle behavior. |

### Needs Adjustment/Modification: Profile Lifecycle

| Current state | Final System Design requires | Gap | Recommended action |
| --- | --- | --- | --- |
| `submitStep1` creates an `employees` row when the employee number is new. | The public portal must never create a master employee profile. New profiles are created only through authorized Add Profile. | Public auto-creation is a direct conflict. | Remove public insert behavior. Return `PROFILE_NOT_FOUND` and instruct the person to contact authorized HR/System Administrator. |
| `submitStep1` updates the permanent employee name, title, division, and section when the employee number exists. | Public access verifies an existing profile; it does not maintain master data. | A public submission can overwrite authoritative data. | Remove public profile updates. Compare submitted identity fields to the stored profile and record only the evaluation snapshot. |
| Authorized employee list/get functions exist. | Add Profile is an authorized function with duplicate prevention and supporting employee information. | There is no visible Add Profile route/function or separate employee-profile maintenance workflow. | Create `createEmployeeProfile`, profile update/deactivation functions, duplicate checks, and an authorized UI. |
| Employee snapshots are stored in evaluation records. | Historical evaluations remain linked to a stable profile while preserving prior snapshots. | Snapshot preservation should be made explicit and protected from public changes. | Keep immutable evaluation snapshots and add database constraints/audit events for profile changes. |

### Needs to Be Created

- Employee verification request schema using employee number, first name, middle name/initial, and last name.
- A public verification step before rendering or enabling A–J fields.
- A verification result that does not disclose unnecessary employee information.
- Authorized Add Profile UI and server function for HR/System Administrator.
- Duplicate prevention by employee number and any additional confirmed identity key.
- Profile status handling, including active/inactive behavior for public verification.
- Explicit employee-profile change audit records.

### Security Adjustments

The current public portal has no identity proof, CAPTCHA, rate limiting, or anti-automation control. The Final System Design requires profile verification but does not specify the identity assurance level. At minimum, implement exact profile matching, cycle-level duplicate protection, generic failure messages, rate limiting, and audit-safe logging. CAPTCHA, OTP, or additional verification is **Needs Clarification** rather than an assumed requirement.

---

## 4. End-To-End Workflow And Approval Process

### Current Workflow

The current status model in `src/lib/domain.ts` and server functions is:

```text
EMPLOYEE_SUBMITTED
        |
        v
SUPERVISOR_DRAFT -> SUPERVISOR_SUBMITTED -> PRESIDENT_REVIEW
                                                |
                                                v
                                      PRESIDENT_SUBMITTED
                                                |
                                                v
                                      READY_FOR_FINALIZATION
                                                |
                                                v
                                           FINALIZED
```

Correction uses `RETURNED_FOR_CORRECTION`.

### Final System Design Workflow

```text
HR opens cycle and generates shared QR/link
        |
        v
Employee verifies profile -> Step 1 A-J ratings -> e-signature -> submit
        |
        v
Immediate Supervisor/Rater reviews locked employee ratings
        |
        v
Supervisor A-J ratings -> Step 2 development fields -> AI assistance
        |
        v
Rater reviews/edits/uses/regenerates/discards AI output
        |
        v
Rater e-signature -> submit
        |
        v
Reviewing Supervisor/Division Head -> Step 3 comments/recommendations
        |
        v
Reviewing Supervisor e-signature -> submit
        |
        v
Personnel Office -> salary/personnel information and evaluation result
        |
        v
Committee -> complete-file review and final action recommendation
        |
        v
President -> final approval or return
        |
        v
FINALIZED -> supporting modules and employee 201 file
```

### Already Implemented

| Current stage/function | Design alignment |
| --- | --- |
| HR cycle creation, activation, token generation, and cycle status handling in `cycles.functions.ts` | Aligns with opening an annual cycle and generating a shared QR/link. |
| Public Step 1 A–J ratings in `public.functions.ts` and `evaluation.$cycleToken.tsx` | Aligns with employee self-evaluation, subject to profile verification and signature changes. |
| Employee ratings are stored separately from later evaluator ratings and are treated as locked after submission. | Aligns with the Rater receiving read-only employee ratings. |
| Supervisor queue, detail view, draft saving, and submission in `evaluations.functions.ts` | Aligns with the Immediate Supervisor/Rater stage. |
| President queue, President responses, scoring, finalization, correction, event history, and PDF generation | Provides a partial later-stage workflow foundation. |
| Optimistic version checks through `assertVersion` | Supports concurrent editing protection, although mutations are not transactional. |

### Missing

| Final System Design requirement | Current state | Gap | Recommended action |
| --- | --- | --- | --- |
| Employee e-signature before Step 1 submission | No employee signature field or signature verification is present in the reviewed workflow. | Required signature evidence is absent. | Add a signature capture/consent component, immutable signature record, timestamp, signer identity context, and validation on submission. |
| Step 2 belongs to the Immediate Supervisor/Rater | Current Step 2/AI behavior is implemented in President-facing functions/UI according to the source audit. | Stage ownership differs. | Move Step 2 ownership and authorization to the Rater stage, retaining President read-only visibility where required. |
| Competency gap analysis before AI recommendations | Current AI derives selected factors and disagreement warnings but there is no persisted competency-gap module. | No explicit competency result/gap data flow. | Create a deterministic competency analysis service and persist its evidence/version before AI generation. |
| Reviewing Supervisor/Division Head Step 3 | No separate role, table, route, or transition is present. | Entire stage is absent. | Create role, permissions, UI, data fields, signature, status, and audit events. |
| Personnel Office processing | No personnel salary/result stage is present. | Entire stage is absent. | Create personnel-processing data model, permission boundary, UI, validation, and transition. |
| Committee review and final action | No Committee role, queue, recommendation fields, or approval stage is present. | Entire stage is absent. | Create committee review model, allowed actions, signature/recommendation, queue, and transition. |
| President final approval after Committee | President functions exist, but current flow reaches finalization from the President review path without the required preceding stages. | Approval order differs. | Change the state machine and enforce predecessor stages server-side. |
| Return from President to correction and re-review | Correction exists, but finalized-state protection and returned-stage transition rules are incomplete. | Direct calls can bypass intended UI restrictions; returned evaluations lack a complete transition path. | Define legal transitions and enforce them in one server-side workflow function and database constraints/triggers. |
| Finalized evaluation feeds supporting modules | Final PDF/history/scoring outputs exist, but no downstream module creation is implemented. | Post-finalization system flow is absent. | Emit a finalization domain event or transaction that creates/updates downstream records idempotently. |

### Needs Adjustment/Modification

1. Replace the current linear shortcut from President review to finalization with the complete stage sequence.
2. Consolidate `savePresidentRatings` and `savePresidentStepAnswers`; the current parallel rating path is inconsistent with the design’s stage ownership and can leave status transitions incomplete.
3. Make finalization atomic. Evaluation status, locks, score, PDF metadata, events, notifications, and downstream module projections must not leave a partially finalized record when one operation fails.
4. Reject correction of finalized evaluations at the server and database boundary, not only in the UI.
5. Define how returned evaluations re-enter the correct stage and preserve versioned history.
6. Preserve read-only access to prior-stage data for later reviewers while preventing unauthorized edits.

### Needs to Be Removed

- The public profile create/update side effect inside Step 1 submission.
- Any President-facing Step 2 implementation that bypasses the Immediate Supervisor/Rater ownership defined by the design.
- Legacy or duplicate workflow paths after the canonical state machine is selected.

---

## 5. Profile, Master Data, And Employee 201 File

### Already Implemented

| Current implementation | Design alignment |
| --- | --- |
| `employees` is separate from `evaluations`; evaluations retain employee snapshots. | Supports a persistent employee profile plus annual historical records. |
| `employee_documents` links documents to employees and optionally evaluations. | Provides a base for a digital employee 201 file. |
| Private `employee-files` storage and signed URLs are implemented. | Aligns with protected employee documents. |
| Employee records are searchable by number, name, division, and section. | Provides a base employee directory. |
| Final PDFs are generated by `documents.server.ts`. | Provides a document artifact for the finalized file. |

### Missing

The Final System Design’s 201 file is a consolidated employee record that receives outputs from the supporting modules. The current implementation lacks persistent entities and screens for:

- Development records
- Training needs and completed/recommended training
- Competency profile and historical gaps
- Career, advancement, transfer, and qualification information
- Recognition and commendations
- Performance history comparison across annual evaluations
- A unified 201-file view combining profile, documents, evaluations, and development records

### Needs Adjustment/Modification

| Current behavior | Required behavior | Recommended action |
| --- | --- | --- |
| Public Step 1 can change master employee fields. | Master profile is created and maintained separately by authorized personnel. | Remove public mutation and add audited authorized maintenance. |
| Upload permission is effectively tied to `employees.view`. | Document management should be separately controlled from viewing employee records. | Add document-specific permissions and validate content type server-side. |
| Employee documents may link to an evaluation, but no downstream source-of-truth policy is defined. | Finalized evaluation is the source for supporting records and 201-file history. | Define whether derived records are immutable projections, editable records with audit, or both. |

### Needs to Be Created

Create a 201-file aggregate view and the underlying module data model. The exact fields require confirmation, but the following relationships are directly supported by the design:

```text
Employee Profile
    |
    +--> Annual Evaluations --> Performance History
    |                         \-> Competency Results and Gaps
    |
    +--> Development Records
    +--> Training Needs / Activities
    +--> Career and Advancement Records
    +--> Recognition Records
    +--> Employee Documents
```

---

## 6. Competency Management

### Already Implemented

- A–J criteria are stored in `evaluation_criteria` and attached to evaluation templates.
- Employee, Supervisor, and President ratings are stored in `evaluation_ratings`.
- AI prompts compare employee and supervisor ratings and identify rating disagreements.
- Scoring provides employee, supervisor, and President averages where available.

### Missing

The design requires competency management based on A–J factors, including:

- Competency profile
- Competency results
- Competency strengths
- Competency gaps
- Historical competency comparison by year
- A deterministic comparison of Employee and Supervisor ratings

No dedicated competency tables, server functions, routes, or persisted gap records are present.

### Needs to Be Implemented

1. Create competency profile/result entities linked to `employees`, `evaluation_criteria`, and `evaluations`.
2. Define the gap algorithm, including rating-difference thresholds and handling of missing ratings.
3. Persist the evidence and algorithm version used for each result.
4. Add competency profile, current result, gap, and historical comparison views.
5. Feed persisted competency gaps into AI prompts rather than recomputing an undocumented interpretation in each AI function.

### Needs Clarification

The document gives an example where Employee 2 and Supervisor 3 produce a development gap, but it does not specify the exact threshold, whether the Supervisor is authoritative, or how President ratings affect competency results. Confirm the algorithm before creating constraints or reports.

---

## 7. AI-Assisted Functions

### Already Implemented

| Current implementation | Design alignment |
| --- | --- |
| `generateEvaluationAiAnalysis`, `suggestPresidentField`, `recordAiSuggestionDecision`, and `saveEvaluationAiAnalysis` exist in `src/lib/ai.functions.ts`. | AI assistance and decision tracking exist. |
| Prompts explicitly prohibit changing ratings, making employment decisions, or finalizing evaluations. | Aligns with the advisory role required by the design. |
| AI output is reviewed through explicit use/edit/regenerate/dismiss interactions in the current design of the functions. | Aligns with human review and decision ownership. |
| AI evidence includes ratings, remarks, employee context, and score data. | Partially aligns with the required input data. |
| `GEMINI_API_KEY` and `GEMINI_MODEL` are documented environment concepts; provider logic exists in `ai-provider.server.ts`. | Supports Gemini/provider configuration. |

### Needs Adjustment/Modification

| Current behavior | Final System Design requirement | Recommended action |
| --- | --- | --- |
| Full analysis is permissioned with `president.view`; field suggestions use President step permissions. | AI operates in the Rater development section and assists the Rater. | Reassign AI permissions to the Rater Step 2 workflow, with any later reviewer visibility explicitly defined. |
| The implementation parses full analysis JSON with a cast to `EvaluationAiAnalysis`. | AI output should be controlled and reliable for downstream development/training records. | Validate the response with a Zod schema, reject malformed arrays/strings, cap lengths, and persist provider/model/source version. |
| `saveEvaluationAiAnalysis` accepts `z.record(z.unknown())`. | Approved AI output must have a known structure and review state. | Replace arbitrary records with a strict schema and explicit draft/edited/approved/discarded state. |
| Suggestions can include employee and job data in provider prompts. | Design requires personalized recommendations but does not define privacy governance. | Add provider, retention, redaction, consent, and audit policies before production use. |
| The function returns a hard-coded `model: "lovable-ai"` while provider configuration may use Gemini. | The Final System Design explicitly names Gemini 2.5 Flash. | Return and persist the actual provider/model identifier; ensure production configuration is Gemini 2.5 Flash if that is the approved choice. |

### Needs to Be Created

- Persisted competency-gap input used for AI generation.
- AI generation version and evidence snapshot.
- Rater-owned Step 2 AI controls: Use, Edit, Regenerate, Discard.
- AI decision audit records linked to the specific field and evaluation version.
- Error/fallback behavior when the AI provider is unavailable.
- Privacy and provider governance configuration.

### Needs Clarification

- Whether AI output is generated once per evaluation or per mapped Step 2 field.
- Whether the Rater or President may regenerate after the Rater submits.
- Whether AI recommendations become editable official text or remain separately labeled suggestions.
- Required Gemini model identifier and whether the Lovable AI Gateway is permitted in production.

---

## 8. Scoring, Saving, And Finalization

### Already Implemented

- Server-only score computation in `src/lib/scoring.server.ts`.
- Employee, Supervisor, and President averages.
- Equal and weighted factor modes.
- Scoring rules, factor weights, rating bands, calculation status, and score persistence.
- Optimistic version checks on relevant mutations.
- Finalization checks for calculated score and required stage timestamps.
- Locked score/rating behavior and final PDF generation foundation.

### Needs Adjustment/Modification

| Current behavior | Gap against design | Recommended action |
| --- | --- | --- |
| `computeScore` calculates the final score from the President average only. | Scoring configuration stores employee and supervisor weights, and the Final System Design describes Employee plus Supervisor competency data. | Decide and implement the approved formula. If the configured weights are intended, include them in the calculation and test the formula. |
| `employeeWeight`, `supervisorWeight`, and display flags are stored but not applied by the calculation engine. | Configuration implies behavior that does not occur. | Remove unused configuration or make it functional; do not expose misleading settings. |
| Scoring bands accept a range that can differ from the 1–5 computed score. | Rating-band configuration can be inconsistent with actual score units. | Align schema, UI, and calculation units. |
| Finalization consists of multiple separate operations. | A failed later operation can leave inconsistent state. | Implement a transactional database function or an idempotent server-side finalization transaction. |
| `returnForCorrection` does not fully reject finalized records at the server/database boundary. | Finalized records should not be reopened through a direct call. | Add explicit finalized-state rejection and database protection. |
| A calculated score may not map to a rating band. | Final result requires an adjective rating. | Block finalization with a clear configuration error and provide an administrator validation path. |

### Needs to Be Implemented

- Complete score formula decision and tests.
- Stage-specific score visibility based on approved configuration.
- Transactional finalization with immutable lock timestamp and actor.
- Final action result fields: Retain, Transfer, Promote, Increase Salary, Training Required, Other.
- Personnel result fields: total points, adjective rating, increase/bonus recommendation.
- Final approval and return workflow after Committee review.
- Idempotent downstream projection from a finalized evaluation.

### Needs to Be Removed

- Duplicate scoring/finalization migration definitions should not be copied into new migrations. Existing applied migrations must not be rewritten; future work should use forward-only corrective migrations.
- Any unused scoring configuration exposed as if it affects results.

---

## 9. Dashboards, Administration, And Navigation

### Already Implemented

- Administrator dashboard and routes for users, roles, employees, and audit logs.
- HR dashboard, cycle list/detail, evaluation history, and employee records.
- Supervisor dashboard, queue, and detail workflow.
- President dashboard, queue, employee records, and detail workflow.
- Search/filter/pagination patterns in queues and reports.
- Loading, empty, error, unauthorized, and submission-success states.

### Missing

The Final System Design role-based sidebars and modules require navigation and dashboards for:

- HR: directory and 201 files, annual evaluations, monitoring, performance history, competency profiles/gaps, development records, training recommendations, career/advancement, recognition, customer feedback, reports, settings.
- Employee/Ratee: annual evaluation, Step 1, and review/e-sign/submit states.
- Immediate Supervisor/Rater: pending, in-progress, completed evaluations, history, development/AI assistance, notifications.
- Reviewing Supervisor/Division Head: pending/completed review, Step 3, development recommendations, notifications.
- Committee: evaluations for review, performance results, final-action recommendations, notifications.
- President: pending/returned/completed final approvals, evaluation results, history, notifications.
- System Administrator: system configuration and evaluation configuration in addition to current administration.

### Needs Adjustment/Modification

| Current implementation | Required action |
| --- | --- |
| Current route tree has no `/admin/scoring` or `/hr/reports`, although older documentation may reference them. | Keep documentation aligned with generated routes. Add routes only when their backend and UI are implemented. |
| Reports are consumed through `/hr/evaluation-history`, not a separate reports module. | Decide whether this is sufficient for the design’s Reports area; if not, add a dedicated report workspace with confirmed report definitions. |
| Generic `getDashboardStats` is not used by current routes and lacks the strongest permission checks. | Remove it if obsolete or secure and use it as a defined dashboard contract. |
| Current sidebars are role-based but only cover the four existing roles and implemented modules. | Extend navigation only alongside authorized module routes; avoid showing unavailable placeholder modules. |

### Needs to Be Created

- Notification center and workflow notification events for each approval stage.
- Monitoring dashboard for cycle progress and bottlenecks.
- Module-specific dashboards backed by permission-filtered aggregates.
- Configuration areas for confirmed master data and evaluation/scoring settings.

---

## 10. Authentication, Authorization, And Security

### Already Implemented

- Supabase Auth for internal users.
- Bearer-token validation in `requireSupabaseAuth`.
- Persistent browser sessions with automatic refresh.
- Application-level RBAC and database RLS.
- Server-only service-role client for trusted operations.
- Private employee-file storage and signed URLs.
- Login, logout, authentication failure, reset, evaluation, and administrative audit events.
- Last-Administrator safeguards.
- Version checks to reduce lost updates.

### Needs Adjustment/Modification

| Current finding | Required action |
| --- | --- |
| `getDashboardStats` has authentication but no clear permission/account usability check. | Add the same authorization boundary as other protected operations. |
| Mandatory password change is enforced in UI behavior but not consistently in server permissions. | Add a server-side password-state requirement or controlled exception for the password-change route. |
| Public `recordAuthFailure` accepts arbitrary input and no visible rate limiting exists. | Add abuse controls, rate limiting, safe logging, and generic responses. |
| `needsBootstrap` exposes initialization state and bootstrap has a possible count-then-create race. | Protect setup with an atomic database operation and decide whether public bootstrap discovery is acceptable. |
| Public Step 1 lacks identity assurance beyond submitted values and cycle token. | Implement profile verification and abuse controls; define stronger verification if required. |
| Upload trusts submitted content type. | Detect/validate file type server-side, restrict allowed formats, enforce size limits, and scan files if required by operations. |
| Service-role writes bypass RLS after application checks. | Keep the boundary server-only and add authorization tests for every server function. |

### Needs to Be Created

- Authorization policy for each new role and module.
- Security tests for direct invocation of server functions.
- Signature integrity model and audit events.
- Data retention and privacy policy for evaluations, 201 files, AI prompts, and generated documents.
- Formal threat controls for the public portal.

### Needs Clarification

The Final System Design requires e-signatures but does not state whether a typed name, drawn signature, authenticated signature, or legally verified signature is required. Decide the legal and operational standard before selecting storage and verification behavior.

---

## 11. Database Entities And Relationships

### Already Implemented

Current migrations define entities for:

- Internal users, roles, permissions, role permissions, and user roles
- Employees, templates, criteria, cycles, evaluations, ratings, and evaluation events
- President step templates, items, and responses
- Scoring rules, factor weights, bands, scores, and notifications
- Audit logs, login events, password reset events
- Employee documents and private storage policies

Current relationships include employees to evaluations, cycles to templates, evaluations to ratings/events/scores, President responses to step items, and documents to employees/evaluations.

### Missing Entities

The Final System Design requires new or expanded entities for:

| Entity area | Purpose |
| --- | --- |
| Employee identity/profile verification | Match public submissions to authorized master profiles without creating them. |
| E-signatures | Store signer, stage, signature representation, timestamp, and immutable evidence. |
| Reviewing Supervisor stage | Store Step 3 comments, recommendations, actor, version, signature, and submission. |
| Personnel processing | Store salary/personnel information, total points, adjective rating, increase/bonus recommendation, actor, and submission. |
| Committee review | Store complete-file review, final action, recommendation, actor, signature, and submission. |
| Competency | Store competency profiles, results, gaps, evidence, thresholds, and historical comparisons. |
| Learning/development | Store development records and activities from evaluation outcomes. |
| Training | Store recommended/required training, rationale, status, and completion information. |
| Career/succession | Store advancement, career/transfer interest, qualifications, and development potential. |
| Recognition | Store commendations and recognition history. |
| Customer feedback | Store or reference feedback received from the existing customer portal. |
| 201-file projections | Provide a unified historical employee record and source links. |

### Needs Adjustment/Modification

- Keep existing applied migration files immutable; add forward-only migrations.
- Resolve duplicated scoring and employee-document migration definitions through documentation and future corrective migrations, not history rewriting.
- Add database constraints for legal workflow transitions, finalized immutability, profile uniqueness, and stage ownership.
- Decide whether derived supporting-module records are generated synchronously during finalization or asynchronously from a durable event.
- Add indexes for employee number, cycle/year, evaluation status, assigned actors, historical queries, and module relationships.

### Needs Clarification

- Whether salary fields require encryption or restricted column access.
- Whether Committee membership is a static role, a per-evaluation assignment, or a group decision.
- Whether customer feedback is stored locally or referenced through an external system.
- Whether a 201 file is a view/projection or a separately editable record.

---

## 12. Integrations And External Dependencies

### Already Implemented

- Supabase Auth, PostgreSQL, RLS, and Storage.
- Vercel-compatible TanStack Start/Nitro deployment configuration.
- Gemini/provider integration boundary through server-only AI provider code.
- PDF generation through PDF-Lib.
- QR/link workflow support through cycle tokens and UI components.

### Missing Or Incomplete

- Customer portal integration and feedback data flow.
- A defined integration contract for finalization-to-module projections.
- Provider governance and failure behavior for Gemini 2.5 Flash.
- Any external training, learning, recognition, or career system integration described by the design. The document does not explicitly require external systems, so these should not be invented.

### Needs Clarification

The design names Gemini 2.5 Flash but does not define API ownership, billing, retention, regional processing, rate limits, or fallback behavior. Confirm these operational requirements before productionizing AI.

---

## 13. Validation And Business Rules

### Already Implemented

- Zod schemas for cycle, evaluation, user, scoring, password, and President inputs.
- Rating values constrained to 1–5.
- Cycle end date must follow start date.
- Required President choices/text are validated where configured.
- Scoring bands are checked for inverted ranges and overlap.
- Weighted factors are checked against the required total.
- Finalization requires calculated score and stage timestamps.
- Duplicate cycle year is constrained by the database.

### Needs Adjustment/Modification

| Rule | Current state | Recommended action |
| --- | --- | --- |
| Employee profile match | New profile is created and existing profile may be overwritten publicly. | Replace with exact verification against an active authorized profile. |
| Employee identity fields | Current form uses a simpler name model. | Add the Final System Design’s first/middle/last verification fields. |
| Signature requirements | Not present in the current end-to-end stages. | Make signature validation mandatory at each required submission boundary. |
| Stage completion | Current status checks do not represent all design stages. | Validate required fields per stage and enforce legal transitions centrally. |
| AI response | Full analysis is cast after JSON parsing; saved analysis is arbitrary record data. | Use strict schemas and versioned evidence. |
| Score weights | Stored weights are not used by final-score calculation. | Align validation and calculation with the approved scoring policy. |
| Finalized state | Some direct backend transitions can bypass UI assumptions. | Add database/server immutability constraints. |

### Needs Clarification

- Exact required fields for Step 2, Step 3, Personnel, Committee, and Customer Feedback.
- Whether all A–J factors are always required for every employee and evaluator.
- Whether a Rater may save incomplete Step 2 data after ratings are entered.
- Whether a returned evaluation preserves prior signatures and recommendations or invalidates them.
- Whether salary/increase values are numeric, ranges, recommendations, or references to payroll data.

---

## 14. Duplicated, Outdated, And Conflicting Functionality

### Needs to Be Removed Or Consolidated

| Current item | Action |
| --- | --- |
| `savePresidentRatings` alongside `savePresidentStepAnswers` | Select one canonical President/step response model after stage ownership is resolved; migrate or remove the legacy path. |
| Duplicate scoring/finalization schema in `20260826114232_scoring_notifications_and_finalization.sql` and `20260827052631_5cfe19a0-7b52-4e18-9763-9cff64b7042b.sql` | Do not edit applied history. Document the duplicate and use a forward-only migration for corrections. |
| Duplicate employee-document/storage definitions in `20260827052820_ba75a5a5-5d96-4834-8dab-a044a7d5c832.sql` and `20260827140000_employee_file_documents_and_storage.sql` | Do not rewrite applied history; consolidate future code and add corrective constraints only if needed. |
| `listAuditLogs` and `listAuditEvents` overlap | Select the richer contract, migrate callers, and remove the redundant function only after all callers are updated. |
| Public profile mutation during Step 1 | Remove because it conflicts directly with profile verification and master-data ownership. |
| Unused scoring display/weight settings | Remove from UI or implement fully; do not leave misleading configuration. |
| Documentation of absent routes such as `/admin/scoring` or `/hr/reports` | Correct documentation unless those routes are implemented. |

### Needs Clarification

The design does not state whether the current President rating path was an intentional variation or an outdated implementation. Confirm the authoritative owner of President ratings and Step 2 before deleting or migrating data.

---

## 15. Recommended Implementation Sequence

### Phase 1: Secure And Stabilize Existing Workflow

1. Remove public employee-profile insert/update behavior.
2. Add authorized Add Profile and public profile verification.
3. Fix server authorization gaps and finalized-record immutability.
4. Consolidate duplicate rating paths.
5. Align scoring formula/configuration and make finalization transactional.
6. Add e-signature design and required submission validation.

### Phase 2: Complete Evaluation Workflow

1. Add Immediate Supervisor/Rater Step 2 ownership.
2. Add Reviewing Supervisor/Division Head Step 3.
3. Add Personnel Office processing.
4. Add Committee review and final action recommendation.
5. Move President approval to the final stage.
6. Implement return/correction transitions for every stage.

### Phase 3: Add Competency And AI Development Flow

1. Implement competency profile/results/gaps.
2. Persist evidence and historical comparisons.
3. Move AI assistance into the Rater development workflow.
4. Add strict AI schemas, provider metadata, decision auditing, and governance controls.

### Phase 4: Add Supporting HR Modules

1. Performance history and annual trend comparison.
2. Learning/development records.
3. Training needs and recommendations.
4. Career and succession records.
5. Recognition records.
6. Unified employee 201 file and module navigation.

### Phase 5: Integrations And Operations

1. Confirm and integrate the customer portal.
2. Add module dashboards, monitoring, notifications, reports, and settings.
3. Add security, authorization, workflow, scoring, AI, and data-integrity tests.
4. Update deployment environment and operational documentation.

---

## 16. Final Compliance Matrix

| Design area | Status | Summary |
| --- | --- | --- |
| Annual cycle and shared QR/link | **Already Implemented** | Cycle creation, activation, token generation, and public route exist. |
| Public employee Step 1 | **Needs Adjustment/Modification** | Exists, but profile verification and signature requirements are missing. |
| Master employee profile | **Needs Adjustment/Modification** | Persistent table exists, but public creation/update conflicts with the design. |
| Immediate Supervisor/Rater | **Needs Adjustment/Modification** | Supervisor workflow exists; Step 2 ownership and stage boundaries need correction. |
| Reviewing Supervisor/Division Head | **Missing** | Role, permissions, data, route, signature, and transition are absent. |
| Personnel Office | **Missing** | Personnel and salary/result processing is absent. |
| Performance Evaluation Committee | **Missing** | Committee review and final action recommendation are absent. |
| President final approval | **Needs Adjustment/Modification** | President functions exist, but approval must follow Committee and Personnel stages. |
| Competency Management | **Missing** | A–J source data exists; competency profiles/gaps/history do not. |
| Gemini 2.5 Flash assistance | **Needs Adjustment/Modification** | Advisory AI exists, but stage ownership, model metadata, schema validation, and governance need alignment. |
| Learning Management | **Missing** | No development activity records or module. |
| Training Management | **Missing** | No training recommendation/need records or module. |
| Succession Planning | **Missing** | No career, advancement, transfer, or qualification module. |
| Social Recognition | **Missing** | No recognition records or module. |
| Performance history | **Partially Implemented** | Evaluation history/reporting exists; competency and development trend history is absent. |
| Digital employee 201 file | **Partially Implemented** | Employee documents and records exist; unified downstream file is absent. |
| Customer feedback | **Missing / Needs Clarification** | No local implementation or confirmed external integration contract. |
| RBAC | **Needs Adjustment/Modification** | Four roles and permission checks exist; the design requires additional stage participants. |
| Security and RLS | **Needs Adjustment/Modification** | Strong foundation exists, with public-portal, authorization, signature, and finalization gaps. |
| Dashboards and administration | **Partially Implemented** | Current role dashboards/admin areas exist; expanded module dashboards and settings are absent. |
| Database model | **Needs to Be Created** | Existing evaluation model is a foundation; supporting module and approval entities are required. |

## 17. Acceptance Criteria For Full Alignment

The system should not be considered aligned with the Final System Design until all of the following are true:

- Public evaluation access verifies an existing active employee profile and never creates or overwrites master employee data.
- Authorized HR/System Administrator users can create and maintain employee profiles with duplicate prevention and audit history.
- Employee Step 1, Rater Step 2, Reviewing Supervisor Step 3, Personnel, Committee, and President stages have explicit owners, permissions, required validations, signatures, statuses, and legal transitions.
- Employee A–J and Supervisor A–J data produce persisted competency results and gaps with a documented algorithm.
- Gemini 2.5 Flash assistance uses approved evidence, strict schemas, explicit human decisions, and auditable provider/model metadata.
- Finalization is atomic, immutable, and produces the required final result and downstream module projections.
- Learning, training, succession/career, recognition, performance history, and digital 201-file capabilities are available through authorized module views.
- Customer feedback behavior is implemented or explicitly excluded by an approved integration decision.
- RBAC and RLS are enforced on the server and database boundaries, including all newly created functions.
- Build, lint, workflow, authorization, scoring, public verification, signature, AI, and migration checks pass before deployment.
