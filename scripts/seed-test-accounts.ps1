param([string]$Email)

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

if (-not $Email) {
  $mfaHeaders = $headers + @{ Prefer = 'return=minimal' }
  Invoke-RestMethod -Method Patch -Uri "$supabaseUrl/rest/v1/system_settings?id=eq.auth" -Headers $mfaHeaders -ContentType 'application/json' -Body (@{ email_otp_enabled = $false } | ConvertTo-Json) | Out-Null
  Write-Output 'Email OTP: disabled for the default test seed.'
}

# Credential delivery is disabled for test seeding. To restore it later, uncomment
# this block and the Send-CredentialEmail call below.
# $brevoApiKey = $env:BREVO_API_KEY
# $emailFrom = $env:EMAIL_FROM
# if ([string]::IsNullOrWhiteSpace($brevoApiKey) -or [string]::IsNullOrWhiteSpace($emailFrom) -or $emailFrom -notmatch '@') {
#   throw 'Credential delivery requires BREVO_API_KEY and EMAIL_FROM environment variables.'
# }
#
# function Send-CredentialEmail($account, $password) {
#   $body = @{
#     sender = @{ name = 'Priority Handling Logistics'; email = $emailFrom }
#     to = @(@{ email = $account.email; name = $account.full_name })
#     subject = 'Your Priority Handling account credentials'
#     htmlContent = "<p>Hello $($account.full_name),</p><p>Your Priority Handling account has been created.</p><p>Email: <strong>$($account.email)</strong></p><p>Temporary password: <strong>$password</strong></p><p>Keep these credentials private.</p>"
#     textContent = "Your Priority Handling account has been created.`n`nEmail: $($account.email)`nTemporary password: $password`n`nKeep these credentials private."
#   } | ConvertTo-Json -Depth 8
#   $mailHeaders = @{ Accept = 'application/json'; 'Content-Type' = 'application/json'; 'api-key' = $brevoApiKey }
#   Invoke-RestMethod -Method Post -Uri 'https://api.brevo.com/v3/smtp/email' -Headers $mailHeaders -ContentType 'application/json' -Body $body | Out-Null
# }

$accounts = @(
  @{ email = 'presidentpriorityph@gmail.com'; full_name = 'Satoshi Sesh'; job_title = 'President'; role = 'PRESIDENT'; previous_email = 'satoshesh@gmail.com' },
  @{ email = 'adminpriorityph@gmail.com'; full_name = 'Bonifacio Raili'; job_title = 'Administrator'; role = 'ADMINISTRATOR'; previous_email = 'bonifacioraili994@gmail.com' },
  @{ email = 'hrpriorityph@gmail.com'; full_name = 'Yang Lionheart'; job_title = 'Human Resources'; role = 'HR'; previous_email = 'yang.lionheart777@gmail.com' },
  @{ email = 'supervisorpriorityph@gmail.com'; full_name = 'Kenshin'; job_title = 'Supervisor'; role = 'SUPERVISOR'; previous_email = 'hkenshin975@gmail.com' },
  @{ email = 'revsupervisorpriorityph@gmail.com'; full_name = 'Boni Dumpp'; job_title = 'Reviewing Supervisor'; role = 'REVIEWING_SUPERVISOR'; previous_email = 'boni.dumpp@gmail.com' },
  @{ email = 'committeepriorityph@gmail.com'; full_name = 'Jay Literalz'; job_title = 'Committee Member'; role = 'COMMITTEE'; previous_email = 'jayyliteral@gmail.com' }
)
if ($Email) { $accounts = @($accounts | Where-Object { $_.email -eq $Email }) }
if ($Email -and $accounts.Count -eq 0) { throw "No seeded account matches $Email." }

$existing = Invoke-RestMethod -Method Get -Uri "$supabaseUrl/auth/v1/admin/users?per_page=1000" -Headers $headers
foreach ($account in $accounts) {
  $match = @($existing.users | Where-Object { $_.email -eq $account.email }) | Select-Object -First 1
  if (-not $match -and $account.previous_email) {
    $match = @($existing.users | Where-Object { $_.email -eq $account.previous_email }) | Select-Object -First 1
  }
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
  # Send-CredentialEmail $account $password
  Write-Output "$($account.role): $($account.email) provisioned (credentials were not emailed)"
  Write-Output "$($account.role): $($account.email) provisioned as $($employee.employee_number)"
}

Write-Output 'All seeded test accounts are ready.'
