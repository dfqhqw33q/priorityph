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
    },
    @{
      email = 'departmentheadpriorityph@gmail.com'
      full_name = 'Manual Test Department Head'
      job_title = 'Department Head'
      role = 'DEPARTMENT_HEAD'
    },
    @{
      email = 'hradminpriorityph@gmail.com'
      full_name = 'Manual Test HR Administrator'
      job_title = 'HR Administrator'
      role = 'HR'
    },
    @{
      email = 'operationsmanagerpriorityph@gmail.com'
      full_name = 'Manual Test Operations Manager'
      job_title = 'Operations Manager'
      role = 'OPERATIONS_MANAGER'
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
  $departmentHead = $usersByEmail['departmentheadpriorityph@gmail.com']
  $operationsManager = $usersByEmail['operationsmanagerpriorityph@gmail.com']
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
  $operationsManagerEmployee = Invoke-RestMethod `
    -Method Post `
    -Uri "$supabaseUrl/rest/v1/rpc/ensure_internal_user_employee" `
    -Headers $headers `
    -ContentType 'application/json' `
    -Body (@{ _user_id = $operationsManager.id } | ConvertTo-Json)

  if (
    -not $supervisorEmployee.id -or
    -not $driverEmployee.id -or
    -not $operationsManagerEmployee.id
  ) {
    throw 'Could not create or resolve employee records for the test accounts.'
  }

  $driverPosition = Invoke-RestMethod `
    -Method Get `
    -Uri "$supabaseUrl/rest/v1/job_positions?name=eq.Driver&select=id" `
    -Headers $headers
  if (-not $driverPosition -or -not $driverPosition[0].id) {
    throw 'The Driver position is missing. Apply the performance-management migration before seeding.'
  }

  $department = Invoke-RestMethod `
    -Method Post `
    -Uri "$supabaseUrl/rest/v1/performance_departments?on_conflict=division%2Csection&select=id" `
    -Headers ($headers + @{ Prefer = 'resolution=merge-duplicates,return=representation' }) `
    -ContentType 'application/json' `
    -Body (@{
      division = 'Operations'
      section = 'Delivery'
      label = 'Operations / Delivery'
    } | ConvertTo-Json)
  $departmentId = @($department) | Select-Object -ExpandProperty id -First 1
  if ([string]::IsNullOrWhiteSpace($departmentId)) {
    throw 'Could not create or resolve the Operations / Delivery department.'
  }

  $supervisorUpdate = @{
    job_title = 'Supervisor'
    employment_status = 'ACTIVE'
    division = 'Operations'
    section = 'Delivery'
    department_id = $departmentId
  } | ConvertTo-Json
  Invoke-RestMethod `
    -Method Patch `
    -Uri "$supabaseUrl/rest/v1/employees?id=eq.$($supervisorEmployee.id)" `
    -Headers ($headers + @{ Prefer = 'return=minimal' }) `
    -ContentType 'application/json' `
    -Body $supervisorUpdate | Out-Null

  $driverUpdate = @{
    job_title = 'Driver'
    job_position_id = $driverPosition[0].id
    employment_status = 'ACTIVE'
    assigned_supervisor_user_id = $supervisor.id
    division = 'Operations'
    section = 'Delivery'
    department_id = $departmentId
  } | ConvertTo-Json
  Invoke-RestMethod `
    -Method Patch `
    -Uri "$supabaseUrl/rest/v1/employees?id=eq.$($driverEmployee.id)" `
    -Headers ($headers + @{ Prefer = 'return=minimal' }) `
    -ContentType 'application/json' `
    -Body $driverUpdate | Out-Null

  $operationsManagerUpdate = @{
    job_title = 'Operations Manager'
    employment_status = 'ACTIVE'
    division = 'Operations'
    section = 'Delivery'
    department_id = $departmentId
  } | ConvertTo-Json
  Invoke-RestMethod `
    -Method Patch `
    -Uri "$supabaseUrl/rest/v1/employees?id=eq.$($operationsManagerEmployee.id)" `
    -Headers ($headers + @{ Prefer = 'return=minimal' }) `
    -ContentType 'application/json' `
    -Body $operationsManagerUpdate | Out-Null

  $activeDepartmentHeads = @(Invoke-RestMethod `
    -Method Get `
    -Uri "$supabaseUrl/rest/v1/department_head_assignments?department_id=eq.$departmentId&is_active=eq.true&select=user_id" `
    -Headers $headers)
  $activeDepartmentHeads = @(
    $activeDepartmentHeads | Where-Object { $_.user_id }
  )
  $conflictingDepartmentHeads = @(
    $activeDepartmentHeads | Where-Object { $_.user_id -ne $departmentHead.id }
  )
  if (
    $conflictingDepartmentHeads.Count -gt 0
  ) {
    throw 'Operations / Delivery already has another active Department Head; refusing to replace the assignment.'
  }
  if (@($activeDepartmentHeads | Where-Object { $_.user_id -eq $departmentHead.id }).Count -eq 0) {
    Invoke-RestMethod `
      -Method Post `
      -Uri "$supabaseUrl/rest/v1/department_head_assignments?on_conflict=department_id%2Cuser_id" `
      -Headers ($headers + @{ Prefer = 'resolution=merge-duplicates,return=minimal' }) `
      -ContentType 'application/json' `
      -Body (@{
        department_id = $departmentId
        user_id = $departmentHead.id
        is_active = $true
      } | ConvertTo-Json) | Out-Null
  }

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

  $departmentHeadAssignments = @(Invoke-RestMethod `
    -Method Get `
    -Uri "$supabaseUrl/rest/v1/department_head_assignments?department_id=eq.$departmentId&user_id=eq.$($departmentHead.id)&is_active=eq.true&select=user_id" `
    -Headers $headers)
  if ($departmentHeadAssignments.Count -ne 1) {
    throw 'Could not verify the Department Head assignment for Operations / Delivery.'
  }
  $supervisorDepartment = Invoke-RestMethod `
    -Method Get `
    -Uri "$supabaseUrl/rest/v1/employees?user_id=eq.$($supervisor.id)&select=department_id" `
    -Headers $headers
  $driverDepartment = Invoke-RestMethod `
    -Method Get `
    -Uri "$supabaseUrl/rest/v1/employees?user_id=eq.$($employee.id)&select=department_id" `
    -Headers $headers
  $operationsManagerDepartment = Invoke-RestMethod `
    -Method Get `
    -Uri "$supabaseUrl/rest/v1/employees?user_id=eq.$($operationsManager.id)&select=department_id" `
    -Headers $headers
  if (
    @($supervisorDepartment).Count -ne 1 -or
    @($driverDepartment).Count -ne 1 -or
    @($operationsManagerDepartment).Count -ne 1 -or
    $supervisorDepartment.department_id -ne $departmentId -or
    $driverDepartment.department_id -ne $departmentId -or
    $operationsManagerDepartment.department_id -ne $departmentId
  ) {
    throw 'Could not verify the Supervisor, Driver, and Operations Manager share the Operations / Delivery department.'
  }
  $hrPermissions = @(Invoke-RestMethod `
    -Method Get `
    -Uri "$supabaseUrl/rest/v1/role_permissions?role_code=eq.HR&select=permission_code" `
    -Headers $headers)
  foreach ($permission in @(
      'performance.hr_validation.view',
      'performance.hr_validation.return',
      'performance.hr_validation.finalize'
    )) {
    if (@($hrPermissions | Where-Object { $_.permission_code -eq $permission }).Count -eq 0) {
      throw "HR is missing the required permission: $permission."
    }
  }
  $operationsManagerPermissions = @(Invoke-RestMethod `
    -Method Get `
    -Uri "$supabaseUrl/rest/v1/role_permissions?role_code=eq.OPERATIONS_MANAGER&select=permission_code" `
    -Headers $headers)
  foreach ($permission in @(
      'competencies.framework.view',
      'competencies.assessments.view',
      'competencies.gaps.view'
    )) {
    if (@($operationsManagerPermissions | Where-Object { $_.permission_code -eq $permission }).Count -eq 0) {
      throw "Operations Manager is missing the required permission: $permission."
    }
  }
  Write-Output "Driver, Supervisor, and Operations Manager assigned to Operations / Delivery; Department Head assigned to the same department."
  Write-Output 'Operations Manager has competency framework, assessment history, and competency-gap viewing permissions.'
  Write-Output "HR Administrator has HR validation view, return, and finalize permissions. Active period: $periodName"
  Write-Output 'Temporary credentials were not printed or written to disk.'
} finally {
  if ($passwordPointer -ne [IntPtr]::Zero) {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($passwordPointer)
  }
  $passwordPlain = $null
}
