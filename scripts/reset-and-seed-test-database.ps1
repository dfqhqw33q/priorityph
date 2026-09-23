$ErrorActionPreference = 'Stop'

npx.cmd supabase db reset --linked --yes
if ($LASTEXITCODE -ne 0) { throw "Supabase database reset failed with exit code $LASTEXITCODE." }
& "$PSScriptRoot\seed-test-accounts.ps1"
if ($LASTEXITCODE -ne 0) { throw "Account seeding failed with exit code $LASTEXITCODE." }

Write-Output 'Test database reset and account seeding completed.'
