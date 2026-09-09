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

The active migration directory is a clean five-file baseline for the disposable development database. Each migration is organized by responsibility and contains the reviewed SQL in dependency order:

1. Core schema and RBAC
2. Evaluation workflow and scoring
3. Documents, storage access, and signatures
4. Learning, training, succession, and recognition
5. Notifications, reporting, and performance indexes

The prior fragmented modules were flattened into these five files; there are no hidden migration fragments or include directives.

## Applied migration rule

This baseline replaces the prior fragmented history only for the disposable development project documented in `docs/SUPABASE-RESET-AND-SEED.md`. Do not apply it to production or any database whose data must be retained. For a retained deployment, keep its recorded history and create forward-only migrations instead.

## Verification

Before pushing the rebuilt development baseline:

```powershell
npx.cmd supabase migration list --linked
npx.cmd supabase db reset --linked --yes
npx.cmd supabase db push --linked --yes
```

Review the generated SQL and confirm that local and remote migration versions remain aligned.
