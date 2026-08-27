# Database Migration Standards

## Naming

Migration filenames must use the Supabase version timestamp followed by a concise, descriptive, snake_case purpose:

```text
YYYYMMDDHHMMSS_purpose_of_change.sql
```

Examples:

- `20260826105519_initial_schema_and_rbac.sql`
- `20260826112311_president_review_workflow.sql`
- `20260827140000_employee_file_documents_and_storage.sql`

Do not use UUIDs, random identifiers, generic names such as `changes.sql`, or unrelated ticket numbers as the purpose suffix.

## Organization

Each migration should contain one cohesive database change set, including its related tables, indexes, constraints, policies, grants, triggers, and seed rows. Small fragments that belong to the same feature should be kept together in the same migration before it is applied.

The existing migrations retain their original 14-digit Supabase version prefixes because those versions are already recorded in the remote migration history. Their UUID-like suffixes were replaced with descriptive names without changing any SQL.

## Applied migration rule

Never merge, delete, reorder, or change the version prefix of an applied migration. Supabase uses the version prefix as the migration ledger. To improve an already-applied design, create a new forward-only migration with a descriptive filename.

## Verification

Before pushing a migration:

```powershell
npx.cmd supabase migration list --linked
npx.cmd supabase db push --linked --yes
```

Review the generated SQL and confirm that local and remote migration versions remain aligned.
