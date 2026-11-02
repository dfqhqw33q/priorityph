# Priority Handling Performance Portal

Internal HRMS performance-management application for Priority Handling Logistics, Inc. The existing two-portal architecture is retained: Employee and Supervisor. Department Head and HR Administrator pages use the same authenticated application shell and are guarded by role and permission checks.

## Performance approval workflow

The evaluation path is:

**Employee → Supervisor → Department Head → HR Administrator → Finalized**

- Employees save or submit self-assessments. A submitted assessment is read-only unless a correction is assigned to the employee.
- The assigned Supervisor reviews the employee’s ratings and evidence, records an independent assessment, and submits it to the Department Head. The two rating sets and weighted scores remain separate; the application does not average them.
- The authorized Department Head reviews both assessments and can approve or return the Supervisor assessment with a required reason.
- HR reviews completeness and approval history, then finalizes or returns the evaluation to a responsible reviewer with a required reason. Finalization locks ordinary editing and records the HR actor and timestamp.
- A specifically permissioned reviewer can reopen a finalized evaluation through the controlled process. The reopening reason and responsible reviewer are recorded, and the original approval/finalization history is retained.
- Employee and Supervisor submissions are stored as append-only assessment snapshots, so corrections do not erase earlier submitted ratings, comments, or evidence.

Approval queues, detail pages, search, status filtering, sorting, pagination, required-reason dialogs, validation checklist, in-app notifications, and employee result/history views are connected to the workflow services. Notifications are recipient-scoped, deduplicated, and link to the corresponding authorized page.

## Role-based navigation

- **Employee:** My Dashboard, My Profile, My Performance, My Competencies, My Development Plan, Learning Center, My Training, Social Recognition, My Career Development, Notifications, and Help & Support. Existing non-performance modules retain their existing pages or structured module placeholders.
- **Supervisor:** Dashboard, My Team, Performance Management, Competency Management, Development Follow-up, AI Recommendations (review only, if authorized), Learning & Training Progress, Social Recognition, Team Reports, Notifications, and My Profile. Supervisor review and completed/history pages use the existing Supervisor portal.
- **Department Head:** Department Dashboard, Department Performance (Pending Performance Approvals, Approved Evaluations, Returned Evaluations, and Department Evaluation History), Competency & Gap Overview, Learning & Training Overview, Succession Planning, Recognition Overview, Department Reports, Delegated Approvals, Notifications, and My Profile.
- **HR Administrator:** Dashboard, Employee Management, Performance Management (Evaluation Cycles, Evaluation Assignments, Evaluation Profiles, Performance Monitoring, and Evaluation History), Competency Management, Succession Planning, Social Recognition, HR Reports & Analytics, Approval Center (Pending HR Validation, Returned for Correction, and Finalized Evaluations), Notifications, and My Profile.
- **Super Admin and Admin:** retain their existing role-specific navigation and administrative pages.

The performance-management cycle, assignment, profile, monitoring, Department Head approval, HR validation, finalized, and returned queues are working pages. Other modules are not claimed as implemented by this workflow change.

## Permissions and account setup

Authorization is checked by authenticated server functions and enforced again by database workflow functions and Supabase RLS. Department Heads are scoped to evaluations assigned to their stable department ID. Employee and Supervisor assessments remain separate. RLS and server operations use the saved employee, supervisor, department, Department Head, and profile-version relationships rather than department names as the approval key.

The forward-only approval migration creates the following permission codes:

- HR cycle management: `performance.cycles.view`, `performance.cycles.create`, `performance.cycles.edit`, `performance.cycles.launch`
- Assignment/profile/monitoring: `performance.assignments.manage`, `performance.profiles.manage`, `performance.monitoring.view`
- HR validation/history: `performance.hr_validation.view`, `performance.hr_validation.finalize`, `performance.hr_validation.return`, `performance.history.view`
- Controlled reopening: `performance.reopen`
- Department Head: `performance.department.view`, `performance.department_approval.view`, `performance.department_approval.approve`, `performance.department_approval.return`, `performance.department_history.view`
- Department Head account assignment: `performance.department_assignments.manage` (or the existing `users.manage` permission)

The `HR` role receives HR validation viewing/returning, monitoring, cycle viewing, and history viewing by default. **Cycle creation/editing/launch, assignment/profile management, HR finalization, and reopening are not granted to every HR or Supervisor account by default.** Grant the additional permissions only to designated accounts through the existing administrative permission process or a reviewed, privileged database operation. The `user_permissions` table records the grantor, reason, grant time, and optional revocation time. Example grant for an explicitly selected HR internal-user UUID:

```sql
INSERT INTO public.user_permissions (user_id, permission_code, granted_by, reason)
SELECT '<HR_INTERNAL_USER_UUID>'::uuid, permission_code, '<GRANTING_USER_UUID>'::uuid,
       'Designated HR performance cycle and validation authority'
FROM (VALUES
  ('performance.cycles.create'),
  ('performance.cycles.edit'),
  ('performance.cycles.launch'),
  ('performance.assignments.manage'),
  ('performance.profiles.manage'),
  ('performance.hr_validation.finalize')
) AS requested_permissions(permission_code)
ON CONFLICT (user_id, permission_code) DO UPDATE
SET granted_by = EXCLUDED.granted_by,
    granted_at = now(),
    revoked_at = NULL,
    reason = EXCLUDED.reason;
```

Assign Department Head access only to an account with the `DEPARTMENT_HEAD` role, then assign that account to the correct stable department in Evaluation Assignments. Cycle launch requires each active employee to have a position with an effective profile, an assigned Supervisor, and a Department Head assigned to the employee’s department. Do not assign HR permissions to a regular Supervisor account.

## Driver framework

The existing Driver template has eight weighted categories totaling 100%, a 1–5 rating scale, evidence requirements, and separate Employee and Supervisor weighted scores. The current profile manager creates/activates versioned drafts; richer criteria/evidence authoring remains a limitation. HR finalization validates both rating sets and required evidence and does not invent a combined score.

## Technology

- React 19 and TypeScript
- TanStack Start and TanStack Router
- TanStack Query
- Tailwind CSS and the existing UI primitives
- Supabase Auth and PostgreSQL

## Setup

Requirements: Node.js and npm.

```powershell
npm.cmd install
```

Configure these environment variables for Supabase:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_KEY`
- `SUPABASE_URL`
- `SUPABASE_PUBLISHABLE_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`

Never commit credentials or service-role keys.

The repository is linked to Supabase project `nrurkkaroggdhjmtltzh`. Its remote migration ledger still contains historical `20260924...` versions that were removed from the local migration folder. A linked database reset is destructive and rebuilds from the migrations present locally, not from those deleted files. Review the migration list and use the guarded reset script only for the disposable manual-test project. **No reset, remote migration, or account seeding has been run as part of this update.**

The pending local migration set currently defines:

1. `20261102100000_add_employee_portal_role.sql` adds the `EMPLOYEE` enum value.
2. `20261102100100_employee_supervisor_foundation.sql` adds employee supervisor assignment and hire-date fields, Employee permissions, assignment validation, and employee read scoping.
3. `20261102100200_performance_management_schema.sql` defines job positions, evaluation periods, versioned job-specific templates, the initial Driver template and rating scale, separate employee/supervisor evaluation records and ratings, audit history, template snapshots, and RLS.
4. `20261102100500_department_head_role.sql` adds the distinct `DEPARTMENT_HEAD` role.
5. `20261102100600_department_hr_approval_workflow.sql` adds stable department mappings and assignments, user-specific permissions, workflow statuses and decision functions, Supervisor submission snapshots, append-only approval/audit history, deduplicated notifications, finalization locks, and approval RLS.

Apply these migrations only to the intended Supabase environment after reconciling its migration ledger with the historical local migration files. Do not run `supabase db reset` against a database containing records that must be preserved.

Start the application:

```powershell
npm.cmd run dev
```

## Validation

```powershell
npm.cmd run lint
npm.cmd run build
git diff --check
```

## Validation status and limitations

The code changes are not a substitute for validating the migration against the target database. Before production use, apply the migrations in a disposable environment and test with separate Employee, Supervisor, Department Head, specifically authorized HR, and unauthorized HR/Supervisor accounts. In particular, verify cross-employee and cross-department access, mandatory reasons, return/resubmission/reapproval, notifications, finalized-record locking, controlled reopening, and department reassignment.

No live database migration or end-to-end account test was run as part of this code update. Other role modules outside performance approval remain existing functionality or structured placeholders. Evaluation Profiles currently support draft creation and activation but not full criteria/evidence editing.
