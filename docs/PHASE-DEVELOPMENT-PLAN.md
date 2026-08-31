# Performance and Development HR System
# Phase Development Plan

## 1. Document Control

| Item | Value |
| --- | --- |
| Plan status | Proposed implementation plan |
| Source of requirements | `FINAL_SYSTEM_DESIGN_UPDATED.docx` |
| Current implementation baseline | Repository branch `main` at the current local checkout |
| Related analysis | `docs/FINAL-SYSTEM-DESIGN-GAP-ANALYSIS.md` |
| Deployment policy for this plan | Local planning document only; no automatic GitHub push or Vercel deployment |
| Primary application | Priority Handling Logistics, Inc. Performance Evaluation System |

This plan converts the Final System Design gap analysis into sequenced development work. It preserves existing working functionality where it aligns with the design and identifies the controls required before expanding the system.

## 2. Current Baseline

The current repository contains an evaluation-centered React/TypeScript application with:

- TanStack Router routes and TanStack Start server functions.
- Supabase Auth, PostgreSQL, Row Level Security, and private Storage.
- Four application roles: `ADMINISTRATOR`, `PRESIDENT`, `HR`, and `SUPERVISOR`.
- HR evaluation cycles with active cycle tokens and public Step 1 access.
- Employee, Supervisor, and President rating data.
- Supervisor and President queues, evaluation history, reports, scoring, finalization, PDF generation, notifications, audit events, and employee documents.
- Advisory AI functions in `src/lib/ai.functions.ts` and provider handling in `src/lib/ai-provider.server.ts`.
- Forward-only Supabase migration history in `supabase/migrations/`.

The baseline is not yet the complete Final System Design. The design also requires profile verification, additional workflow participants, e-signatures, competency management, learning, training, succession/career, recognition, customer feedback, and a consolidated employee 201 file.

## 3. Target System

```text
Authorized HR / Administrator
          |
          v
Employee master profile and annual cycle
          |
          v
Public profile verification -> Employee Step 1 A-J -> e-signature
          |
          v
Immediate Supervisor / Rater
  A-J ratings + Step 2 development context + AI assistance
          |
          v
Reviewing Supervisor / Division Head
  Step 3 comments, recommendations, e-signature
          |
          v
Personnel Office
  personnel information, salary data, evaluation result
          |
          v
Performance Evaluation Committee
  complete-file review and final action recommendation
          |
          v
President
  final approval or return for correction
          |
          v
Finalized evaluation
          |
          +--> Performance history
          +--> Competency profile and gaps
          +--> Learning / development records
          +--> Training needs and recommendations
          +--> Career / succession records
          +--> Recognition records
          +--> Digital employee 201 file
```

## 4. Delivery Principles

1. **Protect master data.** The public portal verifies existing employee profiles; it never creates or overwrites them.
2. **Enforce workflow on the server.** UI visibility is not an authorization boundary.
3. **Use one canonical state machine.** Duplicate rating and finalization paths must not remain active.
4. **Preserve historical records.** Annual evaluations link to a persistent employee profile and retain immutable snapshots.
5. **Make finalization atomic.** A finalized record must not be partially updated.
6. **Keep AI advisory.** AI may draft development and training recommendations, but it must not change ratings or make employment decisions.
7. **Use forward-only database changes.** Applied migration files are not edited, reordered, merged, or deleted.
8. **Do not build unspecified integrations.** Customer feedback and external systems require confirmed contracts before implementation.
9. **Deliver by vertical slice.** Each phase should include its database, server functions, authorization, UI, audit events, and tests.
10. **Keep deployment manual during development.** This plan does not authorize GitHub pushes, commits, or Vercel deployments.

## 5. Scope And Priorities

### P0: Required Before Workflow Expansion

- Employee profile verification and authorized profile management.
- Server-side authorization hardening.
- Canonical workflow/state-machine design.
- E-signature decision and data model.
- Scoring and finalization correctness.
- Security controls for the public portal.

### P1: Required To Complete The Core Evaluation

- Rater-owned Step 2.
- Reviewing Supervisor/Division Head Step 3.
- Personnel Office processing.
- Committee review and final action recommendation.
- President final approval after Committee review.
- Return and correction behavior for every stage.

### P2: Required Supporting Modules

- Competency Management.
- Gemini 2.5 Flash development/training flow.
- Performance history and trend comparison.
- Learning and development records.
- Training needs and recommendations.
- Career and succession.
- Social recognition.
- Digital employee 201 file.

### P3: Operational And Integration Completion

- Customer feedback boundary and integration.
- Notifications and monitoring.
- Reports, dashboards, settings, and configuration surfaces.
- Operational governance, retention, security testing, and deployment readiness.

## 6. Decisions Required Before Coding

These decisions affect schema design and should be recorded before the relevant phase begins.

| Decision | Why it blocks implementation | Proposed owner |
| --- | --- | --- |
| Are HR/Personnel and Personnel Office one role or separate roles? | Determines role codes, permissions, navigation, and data access. | Business owner |
| Is `SUPERVISOR` the Immediate Supervisor/Rater only, or can it also represent Division Head? | Determines whether a new role or assignment model is needed. | Business owner |
| Are Committee members named users, a group, or a per-evaluation assignment? | Determines approval quorum, signatures, and audit structure. | Business owner |
| What is the legal meaning of e-signature? | Determines whether typed name, drawn signature, authenticated signature, or external verification is required. | Legal/business owner |
| What exact fields are required for Step 2, Step 3, Personnel, Committee, and Customer Feedback? | Prevents incomplete or speculative database design. | Business owner |
| What is the competency-gap algorithm? | Determines derived results, AI evidence, and historical reporting. | HR/business owner |
| What is the final-score formula? | Current configuration stores weights that the calculation engine does not apply. | Business owner/technical owner |
| Are scoring values 1–5 or 0–100? | Current score output and band configuration can use different units. | Business owner/technical owner |
| Is the customer portal external? | Determines whether to build a local module or an API/reference integration. | Integration owner |
| Are learning, training, career, recognition, or payroll systems external? | Determines data ownership and integration scope. | Business owner |
| What data may be sent to Gemini 2.5 Flash? | Prompts contain employee and evaluation information. | Security/business owner |
| What is the retention policy for AI prompts, documents, signatures, and audit data? | Required for storage, privacy, and deletion behavior. | Security/legal owner |

No phase should silently resolve these questions by assumption. Unresolved items remain **Needs Clarification** until approved.

## 7. Phase 0: Baseline, Decisions, And Technical Preparation

### Objective

Create the technical and business baseline required to implement the expanded system without corrupting current evaluation data or migration history.

### Work Items

#### Requirements and workflow

- Approve the complete actor list:
  - HR / Personnel Office
  - Employee / Ratee
  - Immediate Supervisor / Rater
  - Reviewing Supervisor / Division Head
  - Performance Evaluation Committee
  - President
  - System Administrator
  - Customer, subject to integration clarification
- Approve the canonical end-to-end status state machine.
- Map every existing route and server function to a stage and owner.
- Define read-only visibility of earlier-stage content for later reviewers.
- Define correction rules, including which stage reopens and which signatures/data are invalidated.

#### Repository and database preparation

- Keep applied migration files unchanged.
- Document duplicate migration definitions without rewriting history.
- Establish migration naming and review rules from `supabase/migrations/README.md`.
- Add a database schema review checklist for constraints, indexes, RLS, triggers, and audit events.
- Add a test strategy for server functions that use the service-role client.

#### Security preparation

- Inventory every `createServerFn` and its required authentication/account/permission boundary.
- Define the rule for `must_change_password` enforcement.
- Define public-portal rate limits, duplicate handling, and generic error responses.
- Define document type validation and allowed file formats.
- Define AI data governance and provider configuration.

### Deliverables

- Approved role and permission matrix.
- Approved state-transition diagram.
- Approved e-signature decision.
- Approved score formula and units.
- Approved data ownership and integration decisions.
- Baseline route/server-function inventory.
- Phase 1 migration plan.

### Exit Criteria

- No unresolved decision blocks Phase 1 schema work.
- The canonical workflow has one owner per state and one legal transition map.
- Security and data-classification decisions are documented.
- No production deployment is performed as part of this phase.

## 8. Phase 1: Secure And Stabilize Existing Foundations

### Objective

Correct the highest-risk behavior in the existing application before adding new workflow stages.

### 8.1 Employee Master Profile And Verification

#### Current foundation

- `employees` is a persistent table.
- `evaluations` link to `employees` and preserve snapshots.
- `submitStep1` currently creates a profile for an unknown employee number and can update profile fields.

#### Implementation

- Add authorized `createEmployeeProfile` and profile maintenance server functions.
- Add HR/System Administrator Add Profile UI.
- Enforce duplicate employee-number prevention at the database and server layers.
- Add first name, middle name/initial, last name, employee number, job title, division, section, and active status as confirmed fields.
- Add profile audit events for create, update, activate, and deactivate operations.
- Change public Step 1 to verify an existing active profile before displaying or enabling the A–J form.
- Remove public profile insert/update behavior.
- Ensure evaluation snapshots are copied from the verified profile and remain historically stable.
- Return a generic profile-not-found response that does not disclose unnecessary employee data.

#### Required public submission sequence

```text
Employee information
      |
      v
Verify existing employee profile
      |
  +----+----+
  |         |
Existing   Not found
  |         |
  v         v
Check      Refer to HR /
current   System Administrator
year      for profile creation
  |
  +--> Existing submission? --> Block with clear message
  |
  +--> No submission --> Complete evaluation
                    |
                    v
                 E-signature
                    |
                    v
                   Submit
```

- Require Employee Number, First Name, Middle Name, and Last Name for verification.
- Match the submitted identity against an existing active employee master profile before allowing Step 1.
- Do not auto-create a profile when no match exists; instruct the employee to coordinate with HR or the authorized System Administrator.
- After successful profile verification, check the employee identity and configured submission year before creating an evaluation.
- Prevent a second submitted evaluation for the same employee and applicable year.
- Show a clear duplicate-submission message and do not expose another submission form for that year.
- Make the next submission available only when the next configured evaluation year/cycle permits it.
- Record relevant device/session metadata as an additional safeguard, but never use device identity as the primary employee identifier.
- Allow employees to use different devices when their verified identity and current-year submission state are valid.

#### E-signature requirements

- Provide two approved capture methods:
  - Upload an image of the employee signature.
  - Draw/write the signature in a signature-pad control.
- Associate the captured signature securely with the employee submission and relevant evaluation stage.
- Record the signature method, timestamp, evaluation identifier, source version, and submission context.
- Include the signature in the appropriate generated documents or records.
- Prevent signature replacement after the stage is submitted or finalized unless an approved correction workflow explicitly permits it.
- Store signature files privately and validate file type, size, and content before persistence.

#### Device and session protection

- Create a server-side submission-attempt record containing a privacy-reviewed device/session identifier, timestamp, cycle, employee identity reference, and outcome.
- Use device/session signals for anomaly detection, rate limiting, and investigation only.
- Do not reject a submission solely because the device differs from a prior submission.
- Do not log unnecessary raw fingerprint data or secrets.

#### Acceptance criteria

- Public Step 1 cannot create an employee master record.
- Public Step 1 cannot modify an employee master record.
- An unknown or inactive profile cannot proceed to the evaluation.
- Authorized HR/System Administrator users can add a profile once and receive a duplicate error on repeat creation.
- A verified employee cannot submit more than one evaluation for the same configured year.
- A duplicate attempt receives a clear message and creates no second evaluation.
- A legitimate change of device does not bypass or incorrectly trigger the identity-based duplicate rule.
- An employee signature can be uploaded or drawn, is timestamped, privately stored, and associated with the submission.
- Every profile mutation is permission-checked and audited.

### 8.2 Authorization Hardening

#### Implementation

- Add account usability checks to every protected server function.
- Secure or remove `getDashboardStats`, which currently lacks the strongest permission boundary.
- Enforce mandatory password change on the server, with an explicit exception only for password-change operations.
- Make bootstrap behavior atomic and prevent concurrent first-administrator races.
- Add rate limiting and abuse controls for unauthenticated authentication-failure recording.
- Test direct server-function invocation independently of route/UI guards.
- Keep the service-role client restricted to server-only modules.

#### Acceptance criteria

- A user without an active internal profile cannot access protected data through a direct function call.
- A locked or inactive user cannot invoke protected business operations.
- A user required to change a temporary password cannot bypass that requirement by navigating directly.
- Authorization tests cover success, wrong role, missing permission, inactive account, locked account, and finalized-record cases.

### 8.3 Canonical Workflow And Data Integrity

#### Implementation

- Define one transition function for every evaluation state.
- Consolidate `savePresidentRatings` and `savePresidentStepAnswers` after confirming the authoritative design path.
- Add explicit finalized immutability at server and database boundaries.
- Reject correction of finalized evaluations.
- Define returned-evaluation re-entry and version behavior.
- Add database constraints or guarded functions for illegal transitions.
- Identify all operations that must be atomic during finalization.

#### Acceptance criteria

- No UI-hidden action can bypass a server-side state rule.
- Finalized evaluations cannot be changed back to a non-finalized state.
- A returned evaluation has one documented next stage.
- Only one canonical function path writes each workflow stage.

### 8.4 Scoring And Finalization Stabilization

#### Implementation

- Approve the score formula.
- Either apply `employeeWeight` and `supervisorWeight` in `computeScore` or remove those unused settings.
- Align rating-band validation with actual score units.
- Make display flags functional or remove them from configuration.
- Add score formula unit tests and boundary tests.
- Implement transactional or idempotent finalization for status, locks, score, document metadata, events, notifications, and downstream projections.

#### Acceptance criteria

- The configured score formula matches the calculation engine.
- All score bands use the same unit as the final score.
- Finalization cannot leave an evaluation partially locked or partially updated.
- A repeated finalization request is safe and does not duplicate documents/events.

### Phase 1 Deliverables

- Profile verification and authorized profile-management slice.
- Hardened authorization boundaries.
- Canonical workflow transition service.
- Corrected scoring/finalization foundation.
- Migration files, server functions, UI, audit events, and tests for the above.

## 9. Phase 2: Complete The Core Evaluation Workflow

### Objective

Implement every stage in the Final System Design’s approval sequence.

### 9.1 Employee Step 1

#### Implementation

- Retain cycle token and active-date checks.
- Add profile verification before Step 1.
- Add employee information confirmation using approved identity fields.
- Keep A–J ratings constrained to 1–5.
- Add review-before-submit behavior if required by the approved form flow.
- Add employee e-signature at submission.
- Lock employee ratings after submission.
- Record stage, actor context, timestamp, signature evidence, and version.

#### Exit criteria

- Employee can complete only Step 1 through the public portal.
- Employee cannot access Step 2 or any internal route.
- The submission creates an evaluation linked to an existing employee profile.
- Duplicate cycle submissions are handled deterministically.

### 9.2 Immediate Supervisor / Rater Step 2

#### Implementation

- Move Step 2 ownership from the current President-oriented path to the Rater stage, subject to the Phase 0 role decision.
- Display employee A–J ratings as read-only.
- Capture Supervisor A–J ratings.
- Add Step 2 fields from the design:
  - Strengths
  - Weaknesses
  - Development
  - Advancement
  - Career / Transfer
  - Qualification and other recommendations, as confirmed
- Add draft saving with optimistic version control.
- Add Rater e-signature and submit transition.
- Add advisory AI controls after required evidence is present.

#### Exit criteria

- Rater cannot change employee ratings.
- Rater can save incomplete drafts where approved.
- Rater submission requires all approved required fields and signature.
- The next queue is the Reviewing Supervisor/Division Head queue.

### 9.3 Reviewing Supervisor / Division Head Step 3

#### Implementation

- Create role/assignment model after approval.
- Create Step 3 data entity and server functions.
- Add comments and recommendations fields.
- Provide read-only access to prior stages.
- Add e-signature and submission.
- Add queue, detail route, filters, status, audit events, and notifications.

#### Exit criteria

- Only an authorized Reviewing Supervisor/Division Head can edit Step 3.
- Step 3 cannot be submitted without required fields and signature.
- The next stage is Personnel Office processing.

### 9.4 Personnel Office Processing

#### Implementation

- Create personnel-processing entity and permissions.
- Capture approved personnel information, salary data, total points, adjective rating, and increase/bonus recommendation.
- Restrict salary-related data to the approved personnel role.
- Add validation, audit events, version checks, and submission.
- Decide whether any salary data must be encrypted or integrated with payroll.

#### Exit criteria

- Personnel data is not visible to unauthorized roles.
- Required personnel fields are validated before submission.
- The complete file is available to the Committee after Personnel submission.

### 9.5 Performance Evaluation Committee

#### Implementation

- Create Committee role/membership/assignment model.
- Create Committee queue and complete-file review route.
- Add final action options:
  - Retain
  - Transfer
  - Promote
  - Increase Salary
  - Training Required
  - Other
- Add recommendation/comments and e-signature requirements.
- Define whether one or multiple Committee members approve and how quorum is recorded.
- Add audit and notification events.

#### Exit criteria

- Committee can review all required preceding data read-only.
- Committee recommendation is required before President approval.
- Final action options are stored as controlled values, not arbitrary text only.

### 9.6 President Final Approval

#### Implementation

- Move President final approval after Committee and Personnel completion.
- Provide Pending, Returned, and Completed views.
- Show complete file and final action recommendation.
- Add Approve and Return actions with required reason on return.
- Add President e-signature where required.
- Transition approval to `FINALIZED` only after all prerequisites pass.

#### Exit criteria

- President cannot approve an incomplete file.
- Return sends the evaluation to the documented correction stage.
- Approval creates the immutable finalized record and downstream event.

### Phase 2 Deliverables

- Complete state machine and stage-specific routes.
- New roles, permissions, database entities, server functions, forms, queues, notifications, audit events, and tests.
- Updated generated route tree.
- Updated PDF/final-file composition after all required sections are approved.

## 10. Phase 3: Competency Management And AI Development Flow

### Objective

Use A–J ratings and development context to produce transparent competency results and advisory development/training recommendations.

### 10.1 Competency Management

#### Implementation

- Create competency profile/result/gap entities linked to employees, criteria, evaluations, and annual history.
- Define the gap algorithm from approved business rules.
- Record employee and Supervisor ratings used as evidence.
- Calculate competency strengths and gaps deterministically.
- Store algorithm version, source evaluation version, and calculation timestamp.
- Add current competency profile and historical comparison views.
- Ensure missing ratings and returned evaluations are handled explicitly.

#### Acceptance criteria

- Identical source ratings produce deterministic competency results.
- A competency gap can be traced to the exact evaluation and rating evidence.
- Historical comparisons preserve prior annual values.
- Users see only competency data authorized for their role.

### 10.2 Gemini 2.5 Flash Assistance

#### Implementation

- Place AI assistance in the Rater Step 2 development workflow.
- Provide approved evidence only: A–J ratings, rating differences, strengths, weaknesses, development fields, and persisted competency gaps.
- Use strict Zod schemas for generated analysis and saved analysis.
- Persist provider/model, evidence version, generation timestamp, and source evaluation version.
- Implement Use, Edit, Regenerate, and Discard actions.
- Keep AI text separate from official ratings and employment decisions.
- Audit every generation and decision.
- Add safe provider error handling and rate limits.
- Implement approved data redaction, retention, and provider controls.

#### Acceptance criteria

- AI cannot modify official ratings, scores, status, or final actions.
- AI output is schema-validated and bounded in size.
- Rater remains the decision-maker.
- Regeneration and discard are auditable.
- The actual configured model is reported accurately; no hard-coded provider label conflicts with deployment configuration.

### Phase 3 Deliverables

- Competency database and analysis service.
- Competency profile/gap routes and views.
- Rater-owned AI workflow.
- AI governance, schema validation, audit trail, and tests.

## 11. Phase 4: Supporting HR Modules And Digital 201 File

### Objective

Make the finalized evaluation the source data for the required supporting modules.

### 11.1 Performance History

- Extend current evaluation history to include annual A–J trends, employee versus Supervisor comparisons, competency gaps, development recommendations, training needs, career information, and recognition.
- Add year-over-year filters and comparison views.
- Preserve finalized values as historical records.

### 11.2 Learning And Development

- Create development-record entities linked to employees, evaluations, competency gaps, and recommendations.
- Support development activity status and completion information only where confirmed by requirements.
- Add authorized creation, editing, history, and audit behavior.

### 11.3 Training Management

- Create training-need and recommendation entities.
- Distinguish recommended versus required training.
- Link each record to its evaluation, competency gap, AI evidence, or manual recommendation.
- Add status and completion fields only after business confirmation.

### 11.4 Career And Succession

- Create career/advancement records for advancement potential, career/transfer interest, qualifications, and development potential.
- Restrict sensitive career data to approved roles.
- Add historical record behavior and audit events.

### 11.5 Social Recognition

- Create recognition records for commendations and recognition history.
- Link recognition to employee and optional evaluation/source event.
- Add authorized management and read-only history views.

### 11.6 Digital Employee 201 File

- Create an aggregate employee-file view combining:
  - Master employee profile
  - Annual evaluations
  - Final PDFs
  - Competency results and gaps
  - Development records
  - Training needs and activities
  - Career/succession records
  - Recognition records
  - Employee documents
- Decide whether this is a database view/projection or a separately editable record.
- Keep source links and audit history for every derived item.
- Add document-management permissions separate from employee-record viewing.

### 11.7 Finalization Projection

Choose and implement one durable projection strategy:

- Synchronous transaction during finalization, or
- Durable finalization event processed idempotently.

The strategy must ensure that a finalized evaluation eventually produces all required downstream records and that retries do not duplicate them.

### Phase 4 Acceptance Criteria

- Every finalized evaluation appears in performance history.
- Every finalized evaluation can produce competency and development outputs according to approved rules.
- Downstream module records link to their source evaluation and employee profile.
- The 201 file presents a complete, permission-filtered employee history.
- Derived records are not silently lost if a downstream operation fails.

## 12. Phase 5: Customer Feedback, Dashboards, Notifications, And Operations

### Objective

Complete the operating model described by the Final System Design after the core data and workflow are stable.

### 12.1 Customer Feedback

Before implementation:

- Identify the existing customer portal.
- Confirm authentication and API contract.
- Confirm whether feedback is stored in this database or referenced externally.
- Define employee/service/shipment linkage and privacy rules.

After approval:

- Implement the integration or local module.
- Add customer feedback entities or external-reference fields.
- Add role permissions and audit behavior.
- Add feedback visibility to the relevant employee/201-file views.

### 12.2 Dashboards And Navigation

Add role-specific navigation only when the underlying route and permission exist:

- HR/Personnel: directory, 201 files, cycles, monitoring, history, competency, development, training, career, recognition, feedback, reports, settings.
- Rater: pending, in progress, completed, history, development/AI assistance, notifications.
- Reviewing Supervisor: pending/completed Step 3 review, development recommendations, notifications.
- Committee: evaluations for review, results, final action recommendations, notifications.
- President: pending/returned/completed approvals, results, history, notifications.
- Administrator: users, roles, configuration, evaluation configuration, audit logs, settings.

Add monitoring metrics for cycle progress, queue counts, returned evaluations, completion bottlenecks, and failed downstream projections.

### 12.3 Notifications

- Define notification events for each stage submission, return, approval, and failure.
- Add recipient rules based on role/assignment.
- Add in-app notification center if confirmed.
- Ensure notifications do not disclose restricted salary, evaluation, or AI content.

### 12.4 Reports

- Decide whether the current `/hr/evaluation-history` report surface satisfies the design’s Reports module.
- Add dedicated reports only with confirmed report definitions.
- Include performance history, competency, training, development, career, recognition, and cycle metrics as approved.

### Phase 5 Acceptance Criteria

- Every visible navigation item maps to an implemented route and permission.
- Customer feedback behavior is implemented or explicitly excluded by decision.
- Dashboards use permission-filtered data.
- Notifications are auditable and correctly addressed.
- Operational failures are visible without exposing sensitive data.

## 13. Cross-Cutting Technical Workstreams

### 13.1 Database

- Use one cohesive forward-only migration per feature change set.
- Add foreign keys, uniqueness constraints, indexes, RLS policies, audit triggers, and immutable-state guards with each feature.
- Avoid editing applied migration history.
- Review duplicate definitions in existing scoring and employee-document migrations before adding corrective migrations.

### 13.2 Server Functions

For every new or changed function:

- Validate input with Zod.
- Authenticate where required.
- Check active/locked account state.
- Check the exact permission.
- Check record ownership/assignment and legal workflow state.
- Use optimistic version checks where edits can conflict.
- Use transactions or idempotent operations for multi-record changes.
- Write audit events with actor, stage, entity, version, and outcome.

### 13.3 UI And Accessibility

- Keep public and authenticated experiences separate.
- Preserve responsive table behavior and readable mobile layouts.
- Keep read-only previous-stage fields visually distinct from editable fields.
- Provide clear loading, empty, error, unauthorized, unavailable-link, returned-for-correction, and finalized states.
- Make signature controls keyboard accessible and screen-reader labeled.
- Avoid showing actions that the current role or workflow state cannot execute.

### 13.4 Observability

- Record structured errors for server functions and provider failures.
- Track workflow transition failures and downstream projection retries.
- Include correlation identifiers where the runtime supports them.
- Never log service keys, access tokens, full signatures, or unnecessary employee/AI prompt content.

## 14. Testing Strategy

### Unit Tests

- Zod schemas and boundary values.
- State transition legality.
- Profile matching and duplicate detection.
- Competency-gap algorithm.
- Score formula, rounding, bands, and missing ratings.
- AI response schema validation.
- Date/cycle availability rules.

### Integration Tests

- Public profile verification followed by Step 1 submission.
- Duplicate cycle submission behavior.
- Role and permission enforcement for every server-function family.
- Rater Step 2 draft and submission.
- Reviewing Supervisor, Personnel, Committee, and President transitions.
- Return/correction/re-review behavior.
- Transactional or idempotent finalization.
- Downstream 201-file projections.
- Private document access and signed URL expiry.

### Security Tests

- Direct invocation by unauthenticated users.
- Authenticated users without internal profiles.
- Inactive and locked users.
- Wrong-role and missing-permission users.
- Public profile enumeration resistance.
- Rate-limit behavior.
- Finalized-record tampering.
- Service-role key absence from client bundles.
- File content-type and upload-size validation.
- AI prompt data handling and provider failure behavior.

### UI Tests

- Mobile and desktop workflow layouts.
- Read-only employee ratings for Raters.
- Hidden/disabled actions by state and role.
- Signature completion and validation.
- Accessibility labels, keyboard flow, focus order, and contrast.
- Empty, error, loading, returned, and finalized states.

### Required Checks Before Any Deployment

```powershell
npm.cmd run build
npm.cmd run lint
npx.cmd supabase migration list --linked
npx.cmd supabase db push --linked --yes
```

The database commands should be run only when a migration is part of the change and the operator has confirmed the target project.

## 15. Release Gates

### Gate A: Foundation Security

- Profile verification is active.
- Public profile mutation is removed.
- Server authorization tests pass.
- Finalized records are immutable.
- Secrets are absent from committed files and client bundles.

### Gate B: Core Workflow

- All approved stages exist with explicit owners.
- Each stage has validation, signature, audit, status, and correction behavior.
- President approval occurs after Committee review.
- Finalization is atomic/idempotent.

### Gate C: Development Intelligence

- Competency results are deterministic and traceable.
- AI output is advisory, schema-validated, versioned, and audited.
- Provider/model and privacy decisions are approved.

### Gate D: Supporting Modules

- Finalized evaluations project to the 201 file.
- History, competency, learning, training, career, and recognition records are permissioned and traceable.
- Downstream failures are retryable and observable.

### Gate E: Operational Readiness

- Customer feedback is integrated or explicitly excluded.
- Dashboards, notifications, reports, and settings match the approved scope.
- Build, lint, database, security, workflow, and UI tests pass.
- Deployment environment variables are verified against the target Supabase project.

## 16. Risk Register

| Risk | Impact | Mitigation | Phase |
| --- | --- | --- | --- |
| Public portal overwrites employee master data | Incorrect identity and historical records | Remove public mutation; require profile verification | 1 |
| New stages are added without a canonical state machine | Inconsistent approvals and unauthorized transitions | Approve and centralize transitions first | 0-2 |
| Service-role functions bypass RLS incorrectly | Unauthorized data access | Enforce server permissions and direct-call tests | 1 |
| Score settings do not match calculations | Incorrect final results | Approve formula and add calculation tests | 1 |
| Finalization partially succeeds | Locked or incomplete records | Transactional/idempotent finalization | 1-2 |
| AI produces unvalidated or overly specific content | Incorrect recommendations or privacy exposure | Strict schema, evidence controls, audit, provider policy | 3 |
| Supporting modules duplicate or lose finalized data | Incomplete 201 file | Durable idempotent projections | 4 |
| Customer portal assumptions are wrong | Rework or invalid integration | Require interface decision before coding | 0/5 |
| Salary and career data is overexposed | Privacy and compliance impact | Separate permissions and data classification | 2/4 |
| Applied migrations are rewritten | Remote migration drift | Forward-only migration policy | All phases |

## 17. Recommended Work Item Format

Each implementation task should include:

```text
Title:
Phase:
Design requirement:
Current code anchor:
Database changes:
Server-function changes:
Authorization changes:
UI changes:
Validation rules:
Audit/events:
Tests:
Migration:
Dependencies:
Acceptance criteria:
Deployment impact:
```

A task is not complete when only the UI exists. The database, server function, authorization, validation, audit, test, and documentation surfaces must agree.

## 18. Definition Of Done

A phase is complete only when:

- Its requirements are mapped to implemented source files and migration objects.
- Its UI, server, database, authorization, validation, and audit behavior are consistent.
- Direct server-function access is tested.
- Historical and correction behavior is verified.
- `npm.cmd run build` and `npm.cmd run lint` pass.
- Relevant Supabase migration checks pass.
- Documentation reflects the actual routes, functions, roles, and configuration.
- No secrets or generated local deployment artifacts are committed.
- GitHub push and Vercel deployment remain explicit operator actions and are not performed automatically by the development plan.

## 19. Immediate Next Actions

1. Approve the decisions in Section 6.
2. Review `docs/FINAL-SYSTEM-DESIGN-GAP-ANALYSIS.md` against this plan.
3. Create Phase 0 workflow, role, permission, signature, and scoring decision records.
4. Implement Phase 1 profile verification before adding new approval stages.
5. Add tests for public profile mutation prevention and direct authorization calls.
6. Reassess the plan after Phase 1 before beginning Phase 2.

This file is a local development plan. It has not been pushed to GitHub and has not been deployed to Vercel.
