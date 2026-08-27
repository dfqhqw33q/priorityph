# Priority Handling Logistics Performance Evaluation System

## 1. Project Overview

This repository contains a React and TypeScript performance evaluation system for Priority Handling Logistics, Inc. Internal users manage evaluation cycles, review employee self-assessments, complete supervisor and President stages, manage users and roles, view reports, and maintain employee documents.

Employees do not create accounts. They access the public Step 1 assessment through an active cycle token or QR-code URL.

## 2. Architecture

```text
Internal users                         Employees
     |                                      |
     | Supabase Auth                       | cycle token
     v                                      v
TanStack Router + React UI       /evaluation/:cycleToken
              |
              v
TanStack Start server functions
              |
       Auth middleware and RBAC
              |
              +--> Supabase client (user-scoped, RLS)
              +--> Supabase admin client (server-only)
              v
      Supabase Auth + PostgreSQL
              |
              +--> private employee-files storage bucket
```

The client uses the publishable Supabase key. Trusted server functions load the service-role key only on the server for administrative operations.

## 3. Tech Stack

| Area | Technology |
| --- | --- |
| Language | TypeScript |
| UI | React 19 |
| Build and development | Vite, TanStack Start, Nitro |
| Routing | TanStack Router |
| Server state | TanStack Query |
| Forms and validation | React Hook Form, Zod |
| Tables and charts | TanStack Table, Recharts |
| UI primitives | Radix UI, Tailwind CSS, shadcn/ui-style components |
| Backend | TanStack Start server functions |
| Data and authentication | Supabase Auth, PostgreSQL, Row Level Security |
| Documents | Supabase Storage, PDF-Lib |
| Notifications and icons | Sonner, Lucide React |

## 4. Prerequisites

- Node.js compatible with the installed project toolchain.
- npm, or Bun when using the committed `bun.lock`.
- A Supabase CLI session for database operations.
- Access to the linked Supabase project for migrations and account provisioning.
- Vercel CLI authentication for production deployment.

## 5. Project Structure

```text
.
├── public/                         Static assets and logos
├── src/
│   ├── components/                 Shared application and UI components
│   ├── hooks/                      React hooks, including access and mobile state
│   ├── integrations/supabase/      Browser, server, auth, and generated DB clients
│   ├── lib/                        Server functions, domain types, schemas, scoring
│   ├── routes/                     TanStack Router route files
│   ├── router.tsx                  Router creation
│   ├── routeTree.gen.ts            Generated route tree
│   ├── server.ts                   TanStack Start server entry
│   ├── start.ts                    Application start entry
│   └── styles.css                  Tailwind tokens and global styles
├── supabase/
│   ├── migrations/                 Forward-only PostgreSQL migrations
│   └── config.toml                 Local Supabase CLI configuration
├── components.json                 UI component configuration
├── eslint.config.js                ESLint configuration
├── package.json                    Scripts and dependencies
├── tsconfig.json                   TypeScript configuration
├── vite.config.ts                  TanStack/Vite configuration
├── bun.lock                        Bun dependency lockfile
└── SUPABASE-RESET-AND-SEED.md      Database reset and account provisioning runbook
```

## 6. Local Development Setup

Install dependencies and start the development server from the repository root:

```powershell
npm.cmd install
npm.cmd run dev
```

Available npm scripts:

| Command | Purpose |
| --- | --- |
| `npm.cmd run dev` | Start Vite development mode |
| `npm.cmd run build` | Build the client and Nitro server |
| `npm.cmd run build:dev` | Build using development mode |
| `npm.cmd run preview` | Preview the production build |
| `npm.cmd run lint` | Run ESLint |
| `npm.cmd run format` | Format the repository with Prettier |

On PowerShell systems where script shims are blocked, use `npm.cmd` and `npx.cmd`.

## 7. Environment Variables

Create a local `.env` file. It is ignored by Git. Do not commit service keys, access tokens, or AI keys.

| Variable | Used by | Description |
| --- | --- | --- |
| `VITE_SUPABASE_URL` | Browser client | Supabase project URL exposed at build time |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Browser client | Supabase publishable key exposed at build time |
| `SUPABASE_URL` | SSR and server functions | Supabase project URL |
| `SUPABASE_PUBLISHABLE_KEY` | SSR auth client | Supabase publishable key |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-only admin client | Service-role key; never expose to the browser |
| `GEMINI_API_KEY` | AI server functions | Gemini provider credential, when AI features are used |
| `GEMINI_MODEL` | AI server functions | Gemini model identifier |

The browser and deployed server must point to the same Supabase project. The repository runbook identifies the linked project in `SUPABASE-RESET-AND-SEED.md`; credentials are intentionally not reproduced here.

## 8. Database & Migrations

Migrations are stored in `supabase/migrations/` and must be applied forward-only. Applied migration version prefixes must not be changed, reordered, merged, or deleted.

Primary PostgreSQL enums include `app_role`, `cycle_status`, `evaluator_type`, `evaluation_status`, `employment_status`, `scoring_rule_status`, `weighting_mode`, and `calculation_status`.

Primary tables include:

- `internal_users`, `roles`, `permissions`, `role_permissions`, `user_roles`
- `employees`, `evaluation_templates`, `evaluation_criteria`, `evaluation_cycles`
- `evaluations`, `evaluation_ratings`, `evaluation_events`
- `president_step_templates`, `president_step_items`, `president_responses`
- `scoring_rules`, `scoring_rule_factor_weights`, `scoring_rule_bands`, `evaluation_scores`
- `notification_events`, `audit_logs`, `login_events`, `password_reset_events`
- `employee_documents`

The private Supabase Storage bucket is `employee-files`.

Inspect and apply linked migrations:

```powershell
npx.cmd supabase migration list --linked
npx.cmd supabase db push --linked --yes
```

The destructive reset and internal-account provisioning procedure is documented in `SUPABASE-RESET-AND-SEED.md`:

```powershell
npx.cmd supabase projects list
npx.cmd supabase --version
npx.cmd supabase db reset --linked --yes
```

The reset reapplies migrations. Auth users and their application roles are provisioned separately by the runbook using a service-role credential.

## 9. Backend / API

Backend operations are implemented as TanStack Start server functions in `src/lib/`. They are not a separate REST service.

| Module | Server functions |
| --- | --- |
| `access.functions.ts` | `getMyAccess`, `recordLoginEvent`, `recordAuthFailure`, `needsBootstrap`, `bootstrapAdministrator` |
| `admin.functions.ts` | User, role matrix, audit log, employee, and administration statistics operations |
| `cycles.functions.ts` | `listTemplates`, `listCycles`, `getCycle`, `saveCycle`, `changeCycleStatus`, `regenerateCycleToken`, `deleteDraftCycle` |
| `evaluations.functions.ts` | Supervisor and President queues, filters, evaluation detail, supervisor draft/submit/reopen, President review, dashboard statistics |
| `president.functions.ts` | President statistics, steps, ratings, and step answers |
| `public.functions.ts` | `getPublicCycle`, `submitStep1` |
| `reports.functions.ts` | `getReport`, `getEvaluationHistory` |
| `scoring.functions.ts` | Scoring rules, score calculation, finalization, and correction operations |
| `documents.functions.ts` | Employee/evaluation document listing, signed URLs, and uploads |
| `ai.functions.ts` | AI analysis, field suggestions, suggestion decisions, and saved analyses |

Each function validates input with Zod where input is accepted and applies authentication or permission checks appropriate to the operation.

## 10. Authentication & Security

- Supabase Auth provides sessions for internal users.
- Employees use public cycle-token access for Step 1 and do not receive accounts or permanent sessions.
- `requireSupabaseAuth` protects authenticated server functions.
- Application-level permission checks are performed by server-side authorization helpers.
- PostgreSQL Row Level Security protects authenticated data access.
- The service-role client is server-only and bypasses RLS for trusted administrative workflows.
- Employee documents use the private `employee-files` storage bucket and signed access URLs.
- Login, logout, authentication failures, password resets, evaluation events, and administrative actions are recorded through database event/audit tables.
- Local `.env`, Vercel metadata, and Supabase CLI temporary files are ignored by Git.

## 11. System Modules

- Public employee Step 1 assessment through `/evaluation/:cycleToken`.
- Authentication, password reset, and initial setup.
- HR evaluation cycle and template management.
- Supervisor evaluation queue, ratings, drafts, and submission to the President.
- President review queue, Step 2, and Step 3 responses.
- Administrator users, roles, permissions, employee records, and audit logs.
- Evaluation history and reporting.
- Scoring rules, score calculation, finalization, and correction workflows.
- AI-assisted analysis and recommendations through the configured provider.
- Employee document metadata and private document storage.

Implemented routes:

| Area | Routes |
| --- | --- |
| Public | `/`, `/evaluation/:cycleToken`, `/evaluation-submitted` |
| Authentication | `/login`, `/forgot-password`, `/reset-password`, `/setup` |
| Administrator | `/admin`, `/admin/users`, `/admin/roles`, `/admin/employees`, `/admin/audit-logs` |
| HR | `/hr`, `/hr/cycles`, `/hr/cycles/:cycleId`, `/hr/evaluation-history`, `/hr/evaluation-history/:evaluationId` |
| Supervisor | `/supervisor`, `/supervisor/evaluations`, `/supervisor/evaluations/:evaluationId` |
| President | `/president`, `/president/evaluations`, `/president/evaluations/:evaluationId`, `/president/employees` |
| Shared states | `/unauthorized`, not-found route, route error pages |

## 12. Role-Based Access Control (RBAC)

Application roles are `ADMINISTRATOR`, `PRESIDENT`, `HR`, and `SUPERVISOR`. Permission codes are defined in `src/lib/domain.ts` and stored as `module.action` values.

| Role | Typical permitted areas implemented in the application |
| --- | --- |
| Administrator | Users, role permissions, employees, audit logs, and system administration |
| HR/Personnel | Evaluation cycles, templates, links, employee records, and evaluation history |
| Supervisor | Step 1 submissions, supervisor ratings, President submission, and permitted history |
| President | President queue, Step 2, Step 3, employee records, and President review operations |

Permission codes include `users.view`, `users.manage`, `users.assign_roles`, `users.reset_password`, `users.revoke_sessions`, `roles.manage`, `permissions.manage`, `employees.view`, `templates.manage`, `cycles.view`, `cycles.manage`, `cycles.manage_link`, `evaluations.view_step1`, `evaluations.rate_supervisor`, `evaluations.submit_president`, `evaluations.reopen_supervisor`, `evaluations.view_history`, `president.view`, `president.step2`, `president.step3`, `evaluations.finalize`, `reports.view`, `audit.view`, `scoring.manage`, `scores.view`, and `evaluations.correct`.

## 13. Deployment

The project is configured for Vercel through the Vite/TanStack configuration. Set the required environment variables in the Vercel project before deployment, especially both browser `VITE_*` variables and server-side Supabase variables.

```powershell
npx.cmd vercel login
npx.cmd vercel --prod
```

After changing environment variables, redeploy the project.

## 14. Testing

The repository currently defines build and lint checks but no automated test script:

```powershell
npm.cmd run build
npm.cmd run lint
```

For database changes, verify migration alignment before deployment:

```powershell
npx.cmd supabase migration list --linked
npx.cmd supabase db push --linked --yes
```

## 15. Troubleshooting

| Symptom | Resolution |
| --- | --- |
| PowerShell blocks `npm` or `npx` | Use `npm.cmd` and `npx.cmd`. |
| Missing Supabase variables | Set the variables in `.env` locally or in Vercel project settings. |
| Browser uses the wrong Supabase project | Verify `VITE_SUPABASE_URL` against the linked project documented in the runbook. |
| Supabase reset reports IPv6 is unsupported | Run `npx.cmd supabase link --project-ref <project-ref>` and retry the linked reset. |
| Authenticated user is unauthorized | Verify `internal_users`, `user_roles`, role permissions, active status, and lock status. |
| Public evaluation link is unavailable | Verify the cycle is active and its cycle token has not been regenerated or disabled. |
| Deployment has stale environment values | Update Vercel environment variables and deploy again. |

## 16. Contributing

1. Create a focused branch from `main`.
2. Keep changes within the owning module and preserve existing route and server-function contracts.
3. Add a forward-only migration for database changes; do not edit applied migration history.
4. Run `npm.cmd run build` and `npm.cmd run lint` before opening a pull request.
5. Do not commit `.env`, service keys, access tokens, generated deployment metadata, or Supabase temporary files.

## 17. License

No license file is present in this repository. Usage and redistribution terms have not been specified in project source.

## 18. Quick Reference

```text
Install:        npm.cmd install
Develop:        npm.cmd run dev
Build:          npm.cmd run build
Lint:           npm.cmd run lint
Format:         npm.cmd run format
Preview:        npm.cmd run preview

Supabase link:  npx.cmd supabase link --project-ref <project-ref>
Migration list: npx.cmd supabase migration list --linked
DB push:        npx.cmd supabase db push --linked --yes
DB reset:       npx.cmd supabase db reset --linked --yes

Vercel login:   npx.cmd vercel login
Vercel deploy:  npx.cmd vercel --prod
```