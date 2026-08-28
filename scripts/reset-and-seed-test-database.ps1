$ErrorActionPreference = 'Stop'

npx.cmd supabase db reset --linked --yes
& "$PSScriptRoot\seed-test-accounts.ps1"

Write-Output 'Test database reset and account seeding completed.'
