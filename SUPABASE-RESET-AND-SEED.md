# Supabase Reset and Seed Runbook

Project: `performance-pulse-15`

Project ref: `opgphfvdqdhxicrebfuk`

Supabase URL: `https://opgphfvdqdhxicrebfuk.supabase.co`

## Prerequisites

Run these commands from the repository root in PowerShell. The Supabase CLI access token must already be available in the environment or stored by `supabase login`.

On Windows, use `npx.cmd` instead of `npx` if PowerShell blocks the script shim.

```powershell
npx.cmd supabase projects list
npx.cmd supabase --version
```

## Reset the Linked Database

This is destructive. It drops the linked database, reapplies every migration, and runs `supabase/seed.sql` when that file exists. The current repository seed data is in the migrations themselves.

```powershell
npx.cmd supabase db reset --linked --yes
```

Expected result includes:

```text
Resetting remote database...
Applying migration ...
{"target":"remote","version":"","message":"Reset remote database."}
```

## Seed Internal Accounts

The reset creates roles, permissions, and the evaluation template, but it does not create Supabase Auth users. Run the repository script below after every reset to create or reset all six internal test accounts and assign their application roles.

$env:PHASE2_TEST_PASSWORD = 'replace-with-a-test-password'
.\scripts\seed-test-accounts.ps1
```

The script uses `SUPABASE_PROJECT_REF` when set, otherwise the linked project above. It is idempotent and never writes the service-role key to disk. The default account emails are:

- `adminpriorityph@gmail.com`
- `presidentpriorityph@gmail.com`
- `supervisorpriorityph@gmail.com`
- `hrpriorityph@gmail.com`
- `revsupervisorpriorityph@gmail.com`
- `committeepriorityph@gmail.com`

## Verify Profiles and Roles

```powershell
$rows = Invoke-RestMethod -Method Get -Uri "$supabaseUrl/rest/v1/internal_users?select=email,full_name,job_title,user_roles(role)&email=in.(admin%40performance-pulse.local,president%40performance-pulse.local,supervisor%40performance-pulse.local,hr%40performance-pulse.local)&order=email" -Headers $headers
$rows | ConvertTo-Json -Compress
```

Each account should have one matching role: `ADMINISTRATOR`, `PRESIDENT`, `SUPERVISOR`, or `HR`.

## Important Deployment Check

The deployed app must use the same project ref as the seeded database:

```env
VITE_SUPABASE_PROJECT_ID=opgphfvdqdhxicrebfuk
VITE_SUPABASE_URL=https://opgphfvdqdhxicrebfuk.supabase.co
```

If the browser calls a different `*.supabase.co` hostname, update the Vercel environment variables and redeploy.
