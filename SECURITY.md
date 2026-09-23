# Security Operations

## Implemented Controls

The application uses Supabase Auth, email MFA, RBAC, resource authorization, RLS, optimistic workflow versions, immutable Employee/Evaluation IDs, private storage, server-side step-up authentication, database-backed rate limits, and audit logging.

Critical actions require an action-bound step-up elevation. Elevations are tied to the Supabase session, expire after ten minutes, and are consumed for fresh critical actions.

Authenticated requests are checked against a server-side three-minute security session. The client timeout remains as the user-facing warning and logout experience.

## Verification

Run `scripts/verify-security-integrity.ps1` with `SUPABASE_PROJECT_REF` or `VITE_SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` configured. It checks:

- Every internal user has exactly one employee link.
- Employee IDs are valid and unique.
- Evaluation IDs are valid and unique.
- User/employee relationship duplicates are absent.

This script does not replace role-specific RLS tests or browser workflow tests.

## Production Configuration

Configure these at the deployment boundary:

- HTTPS only
- HSTS
- Content Security Policy reviewed against deployed assets and Supabase domains
- `X-Content-Type-Options: nosniff`
- `X-Frame-Options: DENY` or an equivalent CSP `frame-ancestors`
- Strict referrer policy
- Permissions Policy
- Supabase Auth redirect allow-list restricted to trusted origins
- Private storage buckets only

The repository provides these headers in `vercel.json`. Review the CSP after deployment because third-party analytics, fonts, or providers may require explicit origins.

## Backup and Recovery Runbook

The repository cannot configure Supabase billing-level backups or point-in-time recovery. Production owners must verify and document:

1. Backup schedule and retention.
2. Point-in-time recovery availability.
3. Restore permissions and responsible operators.
4. A non-production restore test at least quarterly.
5. Migration backup/rollback procedure before destructive changes.
6. Audit-log preservation during restore.
7. Credential rotation after a suspected compromise.

Never test a restore directly over production data.

## Security Verification Checklist

- Cross-user notification and evaluation reads are denied.
- Every role is tested against its permitted workflow resources.
- Step-up cannot be replayed for a different action.
- Critical step-up elevations are consumed once.
- Session requests fail after server-side inactivity expiry.
- Rate limits reject repeated OTP, step-up, account, and export requests.
- Employee and Evaluation IDs remain unique, non-null, and immutable.
- Audit exports contain canonical IDs and no secrets.
- Sensitive document access requires authorization and step-up.
- Finalization rejects stale versions and already-finalized records.

## Remaining Product Decision

Email OTP is the current second factor. Five failed password attempts within 15 minutes lock the matching internal account; an administrator must unlock it. TOTP or passkeys are not yet implemented. Adding either requires an enrollment flow, recovery codes, device revocation, and support recovery. Do not introduce custom cryptography; use Supabase-supported MFA or WebAuthn/passkey libraries.

Automated cross-user RLS, step-up bypass, role escalation, and concurrent-finalization tests require a test runner and isolated Supabase test project, which this repository does not currently provide.
