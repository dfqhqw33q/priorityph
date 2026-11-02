# Priority Handling Performance Portal

Internal HRMS performance-management foundation for Priority Handling Logistics, Inc. The application has two authenticated portals: Employee and Supervisor. Retired public cycle-token and multi-stage HR workflows are not part of the active application.

## Employee and Supervisor portals

- **Employee:** Dashboard, My Profile, Current Evaluation, Self-Evaluation, Evaluation History, Notifications, and Help & Support.
- **Supervisor:** Dashboard, My Profile, My Team, Pending Evaluations, Employee Evaluations, Completed Evaluations, Evaluation History, and Notifications.
- **Shared:** responsive navigation, profile/account details, status and loading/error states, and existing authentication/security infrastructure.

Employee and supervisor roles are checked in authenticated server functions. Employee sign-in also requires a linked active employee record and an active assigned Supervisor. Supervisor team queries are scoped to the authenticated supervisor.

## Driver evaluation implementation status

- The Driver framework defines exactly eight weighted categories totaling 100%, reusable indicators/evidence requirements, a 1–5 rating scale, and independent weighted-score validation.
- The Employee self-evaluation page loads its framework from Supabase and supports saving a draft, previewing ratings and score, and submitting an evaluation. Server-side validation enforces ownership, period availability, unique employee-period records, complete ratings, and locking after submission.
- The Supervisor dashboard, pending queue, and employee-evaluations page load records for the authenticated supervisor's active assigned team, including period, status, submission date, and self-score.
- Supervisor scoring, return-for-revision, comparison/history, evaluation-period management, and in-app workflow notifications are not yet complete.

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

The repository is linked to Supabase project `nrurkkaroggdhjmtltzh`. Its remote migration ledger still contains historical `20260924...` versions that were removed from the local migration folder. A linked database reset is destructive and rebuilds from the migrations present locally, not from those deleted files. Review the migration list and use the guarded reset script only for the disposable manual-test project. No reset, migration, or account seeding has been run as part of this update.

The pending local migration set currently defines:

1. `20261102100000_add_employee_portal_role.sql` adds the `EMPLOYEE` enum value.
2. `20261102100100_employee_supervisor_foundation.sql` adds employee supervisor assignment and hire-date fields, Employee permissions, assignment validation, and employee read scoping.
3. `20261102100200_performance_management_schema.sql` defines job positions, evaluation periods, versioned job-specific templates, the initial Driver template and rating scale, separate employee/supervisor evaluation records and ratings, audit history, template snapshots, and RLS.

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

Do not treat the repository-only workflow as production-ready until the remaining Employee/Supervisor workflow phases are finished and validated.
