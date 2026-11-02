# Database Migration Standards

This directory contains the retained database foundation, reusable security/storage/notification migrations, and the new Employee and Supervisor portal migrations. Standalone local SQL migrations for the retired multi-stage evaluation, scoring/AI, learning/succession/recognition, and workflow-processing features have been removed from the active migration directory. No database tables or records were dropped as part of this cleanup.

The configured Supabase project has a separate migration history; it did not report the removed local `20260924...` migration versions. Do not remove or rewrite migration files that are recorded as applied in any other retained, shared, staging, or production project. Use a forward-only migration to change a live schema.

## Employee and Supervisor Portal Schema

The local portal migrations are not currently compatible with the configured Supabase project and must not be applied there. The live project uses `profiles`, `positions`, `reporting_relationships`, `evaluation_cycles`, `evaluation_profile_versions`, `evaluation_profile_factors`, `evaluation_assignments`, `evaluation_factor_responses`, and `notifications`. The pending local portal migrations instead reference `internal_users` and introduce a parallel evaluation schema. Reconcile the migrations and application queries against the live tables before deployment, reusing suitable existing structures and preserving all existing records. No live migration has been applied as part of this work.

The pending local migration files currently describe:

| Migration                                           | Responsibility                                                                                                                                                                                                                   |
| --------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `20261102100000_add_employee_portal_role.sql`       | Adds the Employee role to the existing role enum.                                                                                                                                                                                |
| `20261102100100_employee_supervisor_foundation.sql` | Adds employee supervisor assignment and hire date, role permissions, assignment validation, and scoped employee reads.                                                                                                           |
| `20261102100200_performance_management_schema.sql`  | Adds job positions, periods, versioned position templates, the Driver template and rating scale, separate employee/supervisor evaluations and ratings, evidence, comments, audit history, immutable template snapshots, and RLS. |

The new migrations do not drop legacy tables or delete existing records. No employee accounts or evaluation records are fabricated. Employee job-position links and supervisor assignments must be provisioned from real employee data before evaluations can be created.

## Naming

New migration filenames must follow:

```text
YYYYMMDDHHMMSS_descriptive_purpose.sql
```

Use a Supabase timestamp prefix, lowercase snake_case, and a concise purpose that identifies the database responsibility. Do not use vague names such as `changes.sql`, `fix.sql`, `update.sql`, `misc.sql`, `temp.sql`, or `final.sql`. Do not use random identifiers or unrelated ticket numbers as filenames.

## Organization

Each future migration must contain one meaningful database change or one closely related group of changes. Keep related tables, constraints, indexes, functions, triggers, policies, grants, and reference data together when they form one feature boundary. Do not create a migration for every small alteration, and do not combine unrelated features solely to reduce the file count.

Preserve dependency order. Referenced types and tables must exist before dependent tables and constraints. Functions must be defined before triggers or policies that call them. Policies must be created after the objects they protect. Permission rows must exist before role mappings or policies depend on them.

## SQL Standards

- Use consistent capitalization, indentation, statement termination, and section structure.
- Use descriptive, stable object names consistent with existing conventions.
- Separate statements clearly and keep related definitions together.
- Keep SQL deterministic and safe to re-run where the existing migration pattern supports it.
- Use `IF NOT EXISTS`, `IF EXISTS`, or conflict handling only where it preserves the intended final state; do not hide unexpected schema errors.
- Add comments only when they explain a non-obvious reason or dependency.
- Remove obsolete implementations and duplicate definitions during authorized baseline consolidation.
- Do not introduce database logic that duplicates application logic without a clear requirement.

## Integrity

Preserve the actual database integrity model. Review existing definitions before changing any of the following:

- Primary keys and foreign keys
- Unique constraints and unique indexes
- Check constraints
- `NOT NULL` requirements
- Default values
- Delete and update actions
- Evaluation finalization and record-locking protections

Never remove or weaken a constraint merely to make a migration easier. Any change must account for existing rows and dependent objects.

## Indexes

Every index must have a demonstrated application query or integrity purpose. Before adding one, inspect existing indexes for duplication. Do not add speculative indexes or indexes solely because they are commonly recommended. Preserve indexes used by evaluation queues, employee and evaluation lookups, notifications, audit history, documents, signatures, and downstream HR modules when they remain required.

## Functions and Triggers

The current database uses authorization, timestamp, finalization-protection, document-version, notification fan-out, and reporting functions, together with triggers that invoke them. Before changing a function or trigger:

1. Identify its callers and dependent policies or triggers.
2. Preserve its security mode and fixed search path where present.
3. Confirm that the replacement maintains the existing authorization and locking behavior.
4. Remove an obsolete definition only when no application or database object requires it.

Avoid unnecessary triggers and duplicate function implementations. Document non-obvious protection or fan-out behavior in SQL comments.

## Security and RLS

Row Level Security is a required part of this database. The repository contains RLS for application tables, workflow records, notifications, documents, signatures, downstream HR modules, and relevant storage objects. It also contains explicit grants and authorization functions such as `has_role`, `has_permission`, and `is_account_usable`.

- Do not disable RLS to resolve an application problem.
- Do not create permissive policies without verifying the required application role or permission.
- Follow least privilege for grants and policy conditions.
- Review existing policies before adding or replacing one; avoid duplicate or conflicting policies.
- Protect confidential employee, evaluation, audit, signature, and HR data.
- Never commit passwords, service-role keys, tokens, private keys, or other secrets to SQL files.

Storage access must preserve the private `employee-files` bucket behavior. Realtime configuration must preserve the existing notification publication membership and fan-out behavior.

## Data Changes

Treat data-changing statements as migrations with operational impact, not harmless schema declarations. The baseline contains reference-data inserts, role and permission mappings, evaluation templates and criteria, scoring configuration, workflow backfills, and notification backfill behavior.

- Give every `INSERT`, `UPDATE`, or `DELETE` a clear purpose.
- Make reference-data inserts idempotent where appropriate.
- Validate backfills against existing rows and constraints.
- Review destructive changes explicitly before execution.
- Keep disposable test-account provisioning outside the schema baseline; the repository provisions Auth users through `scripts/seed-test-accounts.ps1`.
- Do not commit real production data or sensitive test credentials.

`supabase/config.toml` enables migrations and references `./seed.sql` for reset seeding, but no `supabase/seed.sql` file is currently present. Do not assume a seed file exists when validating a reset.

## Development and Retained Environments

The current linked project is documented as disposable development/testing infrastructure in `docs/SUPABASE-RESET-AND-SEED.md`. Its data may be deleted when rebuilding the consolidated baseline is intentional.

For retained, shared, staging, or production databases:

- Do not reset or drop the database casually.
- Do not delete, reorder, or rewrite applied migration history.
- Create a new forward-only migration for each subsequent change.
- Treat existing rows and external dependencies as persistent.
- Use backups, review, and an explicit rollout plan for destructive changes.

The consolidated baseline must not be applied to a retained database whose migration ledger or data must remain unchanged.

## Consolidation Rules

Historical cleanup must be based on the actual repository SQL. Before removing or consolidating a migration:

1. Identify every object, policy, grant, data change, and dependency it introduced.
2. Determine the final intended definition after later changes.
3. Preserve required behavior and remove only obsolete intermediate states.
4. Check application queries, generated types, storage configuration, and reset scripts for dependencies.
5. Validate the reconstructed baseline against a disposable database.

Do not blindly concatenate SQL, delete a migration because it is short, or copy objects from another project. The objective is a readable final state, not a loss of behavior.

## Future Migration Workflow

1. Inspect the repository and current Supabase migration state.
2. Identify the exact database change and affected objects.
3. Check dependencies, constraints, indexes, functions, triggers, grants, and RLS policies.
4. Decide whether the change belongs in one migration or a closely related migration group.
5. Create a timestamped descriptive filename.
6. Write the smallest maintainable SQL that preserves existing behavior.
7. Review data-changing statements and security implications separately.
8. Validate locally or against the approved disposable database before applying remotely.
9. Commit the migration with the application changes that depend on it when appropriate.

## Pre-Commit Checklist

- The filename has a timestamp and descriptive snake_case purpose.
- The migration represents one meaningful change or related change group.
- All objects are based on repository evidence.
- Dependency order is correct.
- Primary keys, foreign keys, unique and check constraints, defaults, and `NOT NULL` rules are preserved.
- Required indexes are present and duplicate or speculative indexes are absent.
- Functions and triggers have been checked for callers and dependencies.
- RLS policies and grants preserve least privilege.
- Data changes and backfills have a documented purpose.
- No secrets or production/private data are included.
- No applied migration is being edited for a new change in a retained environment.
- Unrelated application or database behavior is excluded.

## Prohibited Practices

Do not:

- Edit an applied migration to introduce a new change in a retained environment.
- Create unnecessary micro-migrations.
- Blindly concatenate, copy, or delete SQL.
- Invent tables, columns, relationships, functions, triggers, policies, indexes, or architecture.
- Disable RLS or weaken authorization to bypass an application issue.
- Create overly permissive policies or speculative indexes.
- Add unnecessary functions, triggers, abstractions, or database complexity.
- Duplicate existing database objects or reference data.
- Hard-code disposable test data into permanent schema definitions without a clear purpose.
- Commit secrets, credentials, tokens, or private production data.
- Reset retained, shared, staging, or production databases casually.
- Mix unrelated changes into a migration.

## Maintenance Standard

Keep `supabase/migrations` clean, readable, purposeful, secure, reproducible, and maintainable. A developer should be able to identify why a migration exists, what it owns, and what it depends on without reconstructing a long sequence of unrelated historical fragments. Keep the baseline logically grouped, but do not combine unrelated database responsibilities merely to reduce the migration count.
