param([System.Security.SecureString]$Password)

$ErrorActionPreference = 'Stop'

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$envFile = Join-Path $repoRoot '.env'
if (-not (Test-Path $envFile)) { throw "Missing environment file: $envFile" }

$envValues = @{}
Get-Content $envFile | ForEach-Object {
  if ($_ -match '^\s*(SUPABASE_PROJECT_ID|SUPABASE_URL|SUPABASE_SERVICE_ROLE_KEY)\s*=\s*(.*)\s*$') {
    $name = $Matches[1]
    $value = $Matches[2].Trim()
    if ($value -match '^"(.*)"$') { $value = $Matches[1] }
    if ($value -match "^'(.*)'$") { $value = $Matches[1] }
    $envValues[$name] = $value
  }
}

$projectRef = $envValues['SUPABASE_PROJECT_ID']
$supabaseUrl = $envValues['SUPABASE_URL'].TrimEnd('/')
$serviceKey = $envValues['SUPABASE_SERVICE_ROLE_KEY']
if (
  [string]::IsNullOrWhiteSpace($projectRef) -or
  [string]::IsNullOrWhiteSpace($supabaseUrl) -or
  [string]::IsNullOrWhiteSpace($serviceKey)
) {
  throw 'Missing SUPABASE_PROJECT_ID, SUPABASE_URL, or SUPABASE_SERVICE_ROLE_KEY in .env'
}

$urlProjectRef = [regex]::Match($supabaseUrl, '^https://([^.]+)\.supabase\.co$').Groups[1].Value
$linkedRefPath = Join-Path $repoRoot 'supabase\.temp\project-ref'
$linkedProjectRef = if (Test-Path $linkedRefPath) { (Get-Content $linkedRefPath -Raw).Trim() } else { '' }
if ($urlProjectRef -ne $projectRef -or ($linkedProjectRef -and $linkedProjectRef -ne $projectRef)) {
  throw 'SUPABASE_PROJECT_ID, SUPABASE_URL, and the linked Supabase project must all match.'
}

if (-not $Password) {
  $Password = Read-Host 'Temporary password for both manual-test accounts' -AsSecureString
}

$passwordPointer = [IntPtr]::Zero
try {
  $passwordPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($Password)
  $passwordPlain = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($passwordPointer)
  if ($passwordPlain.Length -lt 12) { throw 'The test password must be at least 12 characters.' }

  $headers = @{ apikey = $serviceKey; Authorization = "Bearer $serviceKey" }
  $accounts = @(
    @{
      email = 'supervisorpriorityph@gmail.com'
      full_name = 'Manual Test Supervisor'
      job_title = 'Supervisor'
      role = 'SUPERVISOR'
    },
    @{
      email = 'employeepriorityph@gmail.com'
      full_name = 'Manual Test Driver'
      job_title = 'Driver'
      role = 'EMPLOYEE'
    }
  )

  $existingUsers = Invoke-RestMethod `
    -Method Get `
    -Uri "$supabaseUrl/auth/v1/admin/users?per_page=1000" `
    -Headers $headers
  $usersByEmail = @{}

  foreach ($account in $accounts) {
    $match = @($existingUsers.users | Where-Object { $_.email -ieq $account.email }) |
      Select-Object -First 1
    $authBody = @{
      email = $account.email
      password = $passwordPlain
      email_confirm = $true
      user_metadata = @{ full_name = $account.full_name }
    } | ConvertTo-Json -Depth 5

    if ($match) {
      $user = Invoke-RestMethod `
        -Method Put `
        -Uri "$supabaseUrl/auth/v1/admin/users/$($match.id)" `
        -Headers $headers `
        -ContentType 'application/json' `
        -Body $authBody
    } else {
      $user = Invoke-RestMethod `
        -Method Post `
        -Uri "$supabaseUrl/auth/v1/admin/users" `
        -Headers $headers `
        -ContentType 'application/json' `
        -Body $authBody
    }

    $usersByEmail[$account.email] = $user
    $profileBody = @{
      id = $user.id
      email = $account.email
      full_name = $account.full_name
      job_title = $account.job_title
      is_active = $true
      is_locked = $false
      must_change_password = $false
    } | ConvertTo-Json -Depth 5
    Invoke-RestMethod `
      -Method Post `
      -Uri "$supabaseUrl/rest/v1/internal_users" `
      -Headers ($headers + @{ Prefer = 'resolution=merge-duplicates,return=minimal' }) `
      -ContentType 'application/json' `
      -Body $profileBody | Out-Null

    Invoke-RestMethod `
      -Method Delete `
      -Uri "$supabaseUrl/rest/v1/user_roles?user_id=eq.$($user.id)" `
      -Headers $headers | Out-Null
    $roleBody = @{ user_id = $user.id; role = $account.role } | ConvertTo-Json
    Invoke-RestMethod `
      -Method Post `
      -Uri "$supabaseUrl/rest/v1/user_roles" `
      -Headers ($headers + @{ Prefer = 'return=minimal' }) `
      -ContentType 'application/json' `
      -Body $roleBody | Out-Null
  }

  $supervisor = $usersByEmail['supervisorpriorityph@gmail.com']
  $employee = $usersByEmail['employeepriorityph@gmail.com']
  $supervisorEmployee = Invoke-RestMethod `
    -Method Post `
    -Uri "$supabaseUrl/rest/v1/rpc/ensure_internal_user_employee" `
    -Headers $headers `
    -ContentType 'application/json' `
    -Body (@{ _user_id = $supervisor.id } | ConvertTo-Json)
  $driverEmployee = Invoke-RestMethod `
    -Method Post `
    -Uri "$supabaseUrl/rest/v1/rpc/ensure_internal_user_employee" `
    -Headers $headers `
    -ContentType 'application/json' `
    -Body (@{ _user_id = $employee.id } | ConvertTo-Json)

  if (-not $supervisorEmployee.id -or -not $driverEmployee.id) {
    throw 'Could not create or resolve employee records for the test accounts.'
  }

  $driverPosition = Invoke-RestMethod `
    -Method Get `
    -Uri "$supabaseUrl/rest/v1/job_positions?name=eq.Driver&select=id" `
    -Headers $headers
  if (-not $driverPosition -or -not $driverPosition[0].id) {
    throw 'The Driver position is missing. Apply the performance-management migration before seeding.'
  }

  $driverUpdate = @{
    job_title = 'Driver'
    job_position_id = $driverPosition[0].id
    employment_status = 'ACTIVE'
    assigned_supervisor_user_id = $supervisor.id
  } | ConvertTo-Json
  Invoke-RestMethod `
    -Method Patch `
    -Uri "$supabaseUrl/rest/v1/employees?id=eq.$($driverEmployee.id)" `
    -Headers ($headers + @{ Prefer = 'return=minimal' }) `
    -ContentType 'application/json' `
    -Body $driverUpdate | Out-Null

  $today = (Get-Date).Date
  $periodName = "Driver Manual Test $($today.ToString('yyyy-MM-dd'))"
  $encodedPeriodName = [uri]::EscapeDataString($periodName)
  $periodMatches = Invoke-RestMethod `
    -Method Get `
    -Uri "$supabaseUrl/rest/v1/evaluation_periods?name=eq.$encodedPeriodName&select=id" `
    -Headers $headers
  $periodBody = @{
    name = $periodName
    starts_on = $today.ToString('yyyy-MM-dd')
    ends_on = $today.AddDays(30).ToString('yyyy-MM-dd')
    submission_deadline = $today.AddDays(14).ToString('yyyy-MM-dd')
    status = 'ACTIVE'
  } | ConvertTo-Json
  if ($periodMatches.Count -gt 0) {
    Invoke-RestMethod `
      -Method Patch `
      -Uri "$supabaseUrl/rest/v1/evaluation_periods?id=eq.$($periodMatches[0].id)" `
      -Headers ($headers + @{ Prefer = 'return=minimal' }) `
      -ContentType 'application/json' `
      -Body $periodBody | Out-Null
  } else {
    Invoke-RestMethod `
      -Method Post `
      -Uri "$supabaseUrl/rest/v1/evaluation_periods" `
      -Headers ($headers + @{ Prefer = 'return=minimal' }) `
      -ContentType 'application/json' `
      -Body $periodBody | Out-Null
  }

  foreach ($account in $accounts) {
    $user = $usersByEmail[$account.email]
    $roles = Invoke-RestMethod `
      -Method Get `
      -Uri "$supabaseUrl/rest/v1/user_roles?user_id=eq.$($user.id)&select=role" `
      -Headers $headers
    if ($roles.Count -ne 1 -or $roles[0].role -ne $account.role) {
      throw "Could not verify the single $($account.role) role for $($account.email)."
    }
    Write-Output "$($account.role): $($account.email) provisioned"
  }

  Write-Output "Driver employee assigned to supervisor. Active period: $periodName"
  Write-Output 'Temporary credentials were not printed or written to disk.'
} finally {
  if ($passwordPointer -ne [IntPtr]::Zero) {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($passwordPointer)
  }
  $passwordPlain = $null
}
