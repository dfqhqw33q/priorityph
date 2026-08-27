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

The reset creates roles, permissions, and the evaluation template, but it does not create Supabase Auth users. Use the following PowerShell command to create or reset the four internal accounts and assign their application roles.

Replace the passwords before use when appropriate. Do not commit real passwords or service keys to the repository.

```powershell
$ErrorActionPreference = 'Stop'
$projectRef = 'opgphfvdqdhxicrebfuk'
$supabaseUrl = "https://$projectRef.supabase.co"
$keyJson = npx.cmd supabase projects api-keys --project-ref $projectRef --reveal --output json | Out-String
$serviceKey = (($keyJson | ConvertFrom-Json) | Where-Object { $_.name -eq 'service_role' }).api_key
if ([string]::IsNullOrWhiteSpace($serviceKey)) { throw 'Could not obtain service role key' }
$headers = @{ apikey = $serviceKey; Authorization = "Bearer $serviceKey" }

$accounts = @(
  @{ email = 'admin@performance-pulse.local'; full_name = 'System Administrator'; job_title = 'Administrator'; role = 'ADMINISTRATOR'; password = 'CHANGE_ME_ADMIN' },
  @{ email = 'president@performance-pulse.local'; full_name = 'Performance President'; job_title = 'President'; role = 'PRESIDENT'; password = 'CHANGE_ME_PRESIDENT' },
  @{ email = 'supervisor@performance-pulse.local'; full_name = 'Performance Supervisor'; job_title = 'Supervisor'; role = 'SUPERVISOR'; password = 'CHANGE_ME_SUPERVISOR' },
  @{ email = 'hr@performance-pulse.local'; full_name = 'HR Personnel'; job_title = 'HR/Personnel'; role = 'HR'; password = 'CHANGE_ME_HR' }
)

$existing = Invoke-RestMethod -Method Get -Uri "$supabaseUrl/auth/v1/admin/users?per_page=1000" -Headers $headers
foreach ($account in $accounts) {
  $match = @($existing.users | Where-Object { $_.email -eq $account.email }) | Select-Object -First 1
  $body = @{ email = $account.email; password = $account.password; email_confirm = $true; user_metadata = @{ full_name = $account.full_name } } | ConvertTo-Json -Depth 5

  if ($match) {
    $user = Invoke-RestMethod -Method Put -Uri "$supabaseUrl/auth/v1/admin/users/$($match.id)" -Headers $headers -ContentType 'application/json' -Body $body
  } else {
    $user = Invoke-RestMethod -Method Post -Uri "$supabaseUrl/auth/v1/admin/users" -Headers $headers -ContentType 'application/json' -Body $body
  }

  $profile = @{ id = $user.id; email = $account.email; full_name = $account.full_name; job_title = $account.job_title; is_active = $true; is_locked = $false; must_change_password = $true } | ConvertTo-Json
  Invoke-RestMethod -Method Post -Uri "$supabaseUrl/rest/v1/internal_users" -Headers ($headers + @{ Prefer = 'resolution=merge-duplicates' }) -ContentType 'application/json' -Body $profile | Out-Null

  $roleRow = @{ user_id = $user.id; role = $account.role } | ConvertTo-Json
  Invoke-RestMethod -Method Post -Uri "$supabaseUrl/rest/v1/user_roles" -Headers ($headers + @{ Prefer = 'resolution=merge-duplicates' }) -ContentType 'application/json' -Body $roleRow | Out-Null
  Write-Output "$($account.role): $($account.email) provisioned"
}
```

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
