$ErrorActionPreference = 'Stop'

$projectRef = if ($env:SUPABASE_PROJECT_REF) { $env:SUPABASE_PROJECT_REF } else { 'opgphfvdqdhxicrebfuk' }
$supabaseUrl = "https://$projectRef.supabase.co"
$password = if ($env:PHASE2_TEST_PASSWORD) { $env:PHASE2_TEST_PASSWORD } else { 'Phase2Test!2026' }

$keyJson = (& npx.cmd supabase projects api-keys --project-ref $projectRef --reveal --output json | Out-String)
$serviceKey = (($keyJson | ConvertFrom-Json) | Where-Object { $_.name -eq 'service_role' }).api_key
if ([string]::IsNullOrWhiteSpace($serviceKey)) { throw 'Could not obtain the Supabase service-role key.' }

$headers = @{ apikey = $serviceKey; Authorization = "Bearer $serviceKey" }
$accounts = @(
  @{ email = 'adminpriorityph@gmail.com'; full_name = 'System Administrator'; job_title = 'Administrator'; role = 'ADMINISTRATOR' },
  @{ email = 'presidentpriorityph@gmail.com'; full_name = 'Performance President'; job_title = 'President'; role = 'PRESIDENT' },
  @{ email = 'supervisorpriorityph@gmail.com'; full_name = 'Performance Supervisor'; job_title = 'Supervisor'; role = 'SUPERVISOR' },
  @{ email = 'hrpriorityph@gmail.com'; full_name = 'HR Personnel'; job_title = 'HR/Personnel'; role = 'HR' },
  @{ email = 'revsupervisorpriorityph@gmail.com'; full_name = 'Reviewing Supervisor'; job_title = 'Division Head'; role = 'REVIEWING_SUPERVISOR' },
  @{ email = 'committeepriorityph@gmail.com'; full_name = 'Performance Evaluation Committee'; job_title = 'Committee Member'; role = 'COMMITTEE' }
)

$existing = Invoke-RestMethod -Method Get -Uri "$supabaseUrl/auth/v1/admin/users?per_page=1000" -Headers $headers
foreach ($account in $accounts) {
  $match = @($existing.users | Where-Object { $_.email -eq $account.email }) | Select-Object -First 1
  $body = @{ email = $account.email; password = $password; email_confirm = $true; user_metadata = @{ full_name = $account.full_name } } | ConvertTo-Json -Depth 5
  if ($match) {
    $user = Invoke-RestMethod -Method Put -Uri "$supabaseUrl/auth/v1/admin/users/$($match.id)" -Headers $headers -ContentType 'application/json' -Body $body
  } else {
    $user = Invoke-RestMethod -Method Post -Uri "$supabaseUrl/auth/v1/admin/users" -Headers $headers -ContentType 'application/json' -Body $body
  }

  $profile = @{ id = $user.id; email = $account.email; full_name = $account.full_name; job_title = $account.job_title; is_active = $true; is_locked = $false; must_change_password = $false } | ConvertTo-Json
  Invoke-RestMethod -Method Post -Uri "$supabaseUrl/rest/v1/internal_users" -Headers ($headers + @{ Prefer = 'resolution=merge-duplicates' }) -ContentType 'application/json' -Body $profile | Out-Null
  $roleRow = @{ user_id = $user.id; role = $account.role } | ConvertTo-Json
  $roleHeaders = $headers + @{ Prefer = 'return=minimal' }
  $roleUrl = "$supabaseUrl/rest/v1/user_roles?user_id=eq.$($user.id)&select=id"
  $existingRole = @(Invoke-RestMethod -Method Get -Uri $roleUrl -Headers $headers) | Select-Object -First 1
  if ($existingRole) {
    Invoke-RestMethod -Method Patch -Uri "$supabaseUrl/rest/v1/user_roles?id=eq.$($existingRole.id)" -Headers $roleHeaders -ContentType 'application/json' -Body (@{ role = $account.role } | ConvertTo-Json) | Out-Null
  } else {
    Invoke-RestMethod -Method Post -Uri "$supabaseUrl/rest/v1/user_roles" -Headers $roleHeaders -ContentType 'application/json' -Body $roleRow | Out-Null
  }
  Write-Output "$($account.role): $($account.email) provisioned"
}

Write-Output 'All six test accounts are ready.'
