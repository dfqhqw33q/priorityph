$ErrorActionPreference = 'Stop'

$projectRef = if ($env:SUPABASE_PROJECT_REF) {
  $env:SUPABASE_PROJECT_REF
} elseif ($env:VITE_SUPABASE_URL -match '^https://([^.]+)\.supabase\.co') {
  $Matches[1]
} else {
  'opgphfvdqdhxicrebfuk'
}
$supabaseUrl = "https://$projectRef.supabase.co"
$password = 'Phase2Test!2026'

$serviceKey = $env:SUPABASE_SERVICE_ROLE_KEY
if ([string]::IsNullOrWhiteSpace($serviceKey)) {
  $keyJson = (& npx.cmd supabase projects api-keys --project-ref $projectRef --reveal --output json | Out-String)
  $serviceKey = (($keyJson | ConvertFrom-Json) | Where-Object { $_.name -eq 'service_role' }).api_key
}
if ([string]::IsNullOrWhiteSpace($serviceKey)) { throw 'Could not obtain the Supabase service-role key.' }

$headers = @{ apikey = $serviceKey; Authorization = "Bearer $serviceKey" }
$brevoApiKey = $env:BREVO_API_KEY
$emailFrom = $env:EMAIL_FROM
if ([string]::IsNullOrWhiteSpace($brevoApiKey) -or [string]::IsNullOrWhiteSpace($emailFrom) -or $emailFrom -notmatch '@') {
  throw 'Credential delivery requires BREVO_API_KEY and EMAIL_FROM environment variables.'
}

function Send-CredentialEmail($account, $password) {
  $body = @{
    sender = @{ name = 'Priority Handling Logistics'; email = $emailFrom }
    to = @(@{ email = $account.email; name = $account.full_name })
    subject = 'Your Priority Handling account credentials'
    htmlContent = "<p>Hello $($account.full_name),</p><p>Your Priority Handling account has been created.</p><p>Email: <strong>$($account.email)</strong></p><p>Temporary password: <strong>$password</strong></p><p>Keep these credentials private.</p>"
    textContent = "Your Priority Handling account has been created.`n`nEmail: $($account.email)`nTemporary password: $password`n`nKeep these credentials private."
  } | ConvertTo-Json -Depth 8
  $mailHeaders = @{ Accept = 'application/json'; 'Content-Type' = 'application/json'; 'api-key' = $brevoApiKey }
  Invoke-RestMethod -Method Post -Uri 'https://api.brevo.com/v3/smtp/email' -Headers $mailHeaders -ContentType 'application/json' -Body $body | Out-Null
}

$accounts = @(
  @{ email = 'adminalexpriorityph@gmail.com'; full_name = 'Jay'; job_title = 'Administrator'; role = 'ADMINISTRATOR' },
  @{ email = 'presidentnoahpriorityph@gmail.com'; full_name = 'Noah Sinclair'; job_title = 'President'; role = 'PRESIDENT' },
  @{ email = 'supervisorhanapriorityph@gmail.com'; full_name = 'Charlotte Galleta'; job_title = 'Supervisor / Rater / Immediate Supervisor'; role = 'SUPERVISOR' },
  @{ email = 'hrelenapriorityph@gmail.com'; full_name = 'Wilfredo'; job_title = 'HR / Personnel'; role = 'HR' },
  @{ email = 'revsupliampriorityph@gmail.com'; full_name = 'Reviewing Supervisor'; job_title = 'Reviewing Supervisor / Division Head'; role = 'REVIEWING_SUPERVISOR' },
  @{ email = 'commiteeoliviapriorityph@gmail.com'; full_name = 'Olivia Hayes'; job_title = 'Committee Member'; role = 'COMMITTEE' }
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
  $employee = Invoke-RestMethod -Method Post -Uri "$supabaseUrl/rest/v1/rpc/ensure_internal_user_employee" -Headers ($headers + @{ 'Content-Type' = 'application/json' }) -ContentType 'application/json' -Body (@{ _user_id = $user.id } | ConvertTo-Json)
  if ([string]::IsNullOrWhiteSpace($employee.employee_number)) { throw "Could not resolve an Employee ID for $($account.email)." }
  $roleRow = @{ user_id = $user.id; role = $account.role } | ConvertTo-Json
  $roleHeaders = $headers + @{ Prefer = 'return=minimal' }
  $roleUrl = "$supabaseUrl/rest/v1/user_roles?user_id=eq.$($user.id)&select=id"
  $existingRole = @(Invoke-RestMethod -Method Get -Uri $roleUrl -Headers $headers) | Select-Object -First 1
  if ($existingRole) {
    Invoke-RestMethod -Method Patch -Uri "$supabaseUrl/rest/v1/user_roles?id=eq.$($existingRole.id)" -Headers $roleHeaders -ContentType 'application/json' -Body (@{ role = $account.role } | ConvertTo-Json) | Out-Null
  } else {
    Invoke-RestMethod -Method Post -Uri "$supabaseUrl/rest/v1/user_roles" -Headers $roleHeaders -ContentType 'application/json' -Body $roleRow | Out-Null
  }
  Send-CredentialEmail $account $password
  Write-Output "$($account.role): credentials sent to $($account.email)"
  Write-Output "$($account.role): $($account.email) provisioned as $($employee.employee_number)"
}

Write-Output 'All six test accounts are ready.'
