$ErrorActionPreference = 'Stop'

$projectRef = if ($env:SUPABASE_PROJECT_REF) {
  $env:SUPABASE_PROJECT_REF
} elseif ($env:VITE_SUPABASE_URL -match '^https://([^.]+)\.supabase\.co') {
  $Matches[1]
} else {
  throw 'Set SUPABASE_PROJECT_REF or VITE_SUPABASE_URL.'
}
$serviceKey = $env:SUPABASE_SERVICE_ROLE_KEY
if ([string]::IsNullOrWhiteSpace($serviceKey)) { throw 'SUPABASE_SERVICE_ROLE_KEY is required.' }
$base = "https://$projectRef.supabase.co"
$headers = @{ apikey = $serviceKey; Authorization = "Bearer $serviceKey" }

function Get-Rest($path) {
  Invoke-RestMethod -Method Get -Uri "$base/rest/v1/$path" -Headers $headers
}

$users = @(Get-Rest 'internal_users?select=id,email')
$employees = @(Get-Rest 'employees?select=id,user_id,employee_number')
$evaluations = @(Get-Rest 'evaluations?select=id,evaluation_id,cycle_id')

$duplicateEmployeeIds = @($employees | Group-Object employee_number | Where-Object Count -gt 1)
$duplicateUserLinks = @($employees | Where-Object user_id | Group-Object user_id | Where-Object Count -gt 1)
$missingUserLinks = @($users | Where-Object { $id = $_.id; @($employees | Where-Object user_id -eq $id).Count -ne 1 })
$invalidEmployeeIds = @($employees | Where-Object { $_.employee_number -notmatch '^EMP-[0-9]{6,}$' })
$invalidEvaluationIds = @($evaluations | Where-Object { $_.evaluation_id -notmatch '^EV-[0-9]{4}-[0-9]{6,}$' })
$duplicateEvaluationIds = @($evaluations | Group-Object evaluation_id | Where-Object Count -gt 1)

$result = [ordered]@{
  internalUsers = $users.Count
  employees = $employees.Count
  evaluations = $evaluations.Count
  usersMissingExactlyOneEmployee = $missingUserLinks.Count
  duplicateUserLinks = $duplicateUserLinks.Count
  missingOrInvalidEmployeeIds = $invalidEmployeeIds.Count
  duplicateEmployeeIds = $duplicateEmployeeIds.Count
  invalidEvaluationIds = $invalidEvaluationIds.Count
  duplicateEvaluationIds = $duplicateEvaluationIds.Count
}
$result | ConvertTo-Json

if ($missingUserLinks.Count -or $duplicateUserLinks.Count -or $invalidEmployeeIds.Count -or $duplicateEmployeeIds.Count -or $invalidEvaluationIds.Count -or $duplicateEvaluationIds.Count) {
  throw 'Security integrity verification failed.'
}
Write-Output 'Security integrity verification passed.'
