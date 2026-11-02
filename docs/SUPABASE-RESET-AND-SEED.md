# Supabase Reset and Seed Runbook

Project: `priority_ph`  
Project ref: `nrurkkaroggdhjmtltzh`  
Supabase URL: `https://nrurkkaroggdhjmtltzh.supabase.co`

## What this runbook does

The reset is destructive: it drops and rebuilds the linked database, applies the migrations present in this repository, and runs `supabase/seed.sql` if that file exists. It does not merely add the latest migration. The account seeder then creates or updates four Supabase Auth users, gives each exactly one portal role, assigns the test Department Head to the same department as the Driver and Supervisor, and creates an active manual-test evaluation period.

The account seeder does not disable MFA or change global security settings. It uses the project reference, URL, and service-role key from `.env`; those values must match the Supabase CLI project link.

## Prerequisites

Run commands from the repository root in PowerShell:

```powershell
Set-Location 'C:\Users\Charlotte Galleta\Desktop\priority ph'
npx.cmd supabase --version
npx.cmd supabase projects list
```

The Supabase CLI must be authenticated. `.env` must contain:

```env
SUPABASE_PROJECT_ID=nrurkkaroggdhjmtltzh
SUPABASE_URL=https://nrurkkaroggdhjmtltzh.supabase.co
SUPABASE_SERVICE_ROLE_KEY=...
```

Keep `.env` private. Never paste or commit the service-role key.

## Review the linked migration history

The seeder verifies that `.env` and `supabase/.temp/project-ref` identify the same project. Review the migration plan before resetting:

```powershell
npx.cmd supabase migration list --linked
```

The linked project reference must be `nrurkkaroggdhjmtltzh`. Do not reset a shared or production project. If the project reference, migration history, or environment does not match the disposable manual-test database, stop before proceeding.

## Reset, migrate, and seed

The combined script securely prompts for one temporary password (at least 12 characters) and requires typing the exact project ref before it resets. It will not start the reset if the password is too short or the project ref does not match:

```powershell
.\scripts\reset-and-seed-test-database.ps1
```

To reset and migrate separately, then seed the accounts:

```powershell
npx.cmd supabase db reset --linked --yes
if ($LASTEXITCODE -ne 0) { throw 'Supabase database reset failed.' }
.\scripts\seed-test-accounts.ps1
```

The standalone seeder reads the password with `Read-Host -AsSecureString`. It does not print or save the password. It upserts only the named test accounts, and it removes/replaces role assignments only for those test user IDs.

## Manual-test accounts

| Portal           | Email                                | Seeded record/assignment                       |
| ---------------- | ------------------------------------ | ---------------------------------------------- |
| Supervisor       | `supervisorpriorityph@gmail.com`     | Manual Test Supervisor; Operations / Delivery  |
| Employee         | `employeepriorityph@gmail.com`       | Manual Test Driver; assigned to the Supervisor |
| Department Head  | `departmentheadpriorityph@gmail.com` | Assigned to Operations / Delivery              |
| HR Administrator | `hradminpriorityph@gmail.com`        | HR validation permissions                      |

All four test accounts use the temporary password entered when the seeder prompts. The seeder confirms each user has exactly one role, verifies the Supervisor/Driver department and Department Head assignment, and creates an active evaluation period for the Driver test.

The test accounts are disposable. Do not use these credentials for production or real employee data. Change the password after testing or remove the test accounts from Supabase Auth after the test environment is no longer needed.

## Deployment check

The deployed application must point to the same Supabase project:

```env
VITE_SUPABASE_PROJECT_ID=nrurkkaroggdhjmtltzh
VITE_SUPABASE_URL=https://nrurkkaroggdhjmtltzh.supabase.co
```

If the browser sends requests to a different `*.supabase.co` hostname, correct the Vercel environment variables and redeploy before testing.
