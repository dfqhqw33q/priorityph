$ErrorActionPreference = 'Stop'

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$envFile = Join-Path $repoRoot '.env'
$linkedRefPath = Join-Path $repoRoot 'supabase\.temp\project-ref'
if (-not (Test-Path $envFile)) { throw "Missing environment file: $envFile" }
if (-not (Test-Path $linkedRefPath)) { throw "Supabase CLI project link is missing: $linkedRefPath" }

$projectRef = ''
$supabaseUrl = ''
$serviceKey = ''
Get-Content $envFile | ForEach-Object {
  if ($_ -match '^\s*(SUPABASE_PROJECT_ID|SUPABASE_URL|SUPABASE_SERVICE_ROLE_KEY)\s*=\s*(.*)\s*$') {
    $name = $Matches[1]
    $value = $Matches[2].Trim()
    if ($value -match '^"(.*)"$') { $value = $Matches[1] }
    if ($value -match "^'(.*)'$") { $value = $Matches[1] }
    if ($name -eq 'SUPABASE_PROJECT_ID') { $projectRef = $value }
    if ($name -eq 'SUPABASE_URL') { $supabaseUrl = $value.TrimEnd('/') }
    if ($name -eq 'SUPABASE_SERVICE_ROLE_KEY') { $serviceKey = $value }
  }
}

$linkedProjectRef = (Get-Content $linkedRefPath -Raw).Trim()
$urlProjectRef = [regex]::Match($supabaseUrl, '^https://([^.]+)\.supabase\.co$').Groups[1].Value
if (
  [string]::IsNullOrWhiteSpace($projectRef) -or
  [string]::IsNullOrWhiteSpace($serviceKey) -or
  $projectRef -ne $linkedProjectRef -or
  $projectRef -ne $urlProjectRef
) {
  throw 'Check SUPABASE_PROJECT_ID, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, and the linked Supabase project.'
}

$password = Read-Host 'Temporary password for both manual-test accounts (12+ characters)' -AsSecureString
if ($password.Length -lt 12) { throw 'The test password must be at least 12 characters.' }

Write-Warning "This permanently resets the linked Supabase database: $projectRef"
$confirmation = Read-Host "Type $projectRef to confirm the destructive reset"
if ($confirmation -cne $projectRef) { throw 'Reset cancelled; the project reference did not match.' }

Set-Location $repoRoot
npx.cmd supabase db reset --linked --yes
if ($LASTEXITCODE -ne 0) { throw "Supabase database reset failed with exit code $LASTEXITCODE." }
& "$PSScriptRoot\seed-test-accounts.ps1" -Password $password

Write-Output 'Test database reset and account seeding completed.'
