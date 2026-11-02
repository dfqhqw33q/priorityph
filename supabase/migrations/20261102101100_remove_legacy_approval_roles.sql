INSERT INTO public.audit_logs (
  actor_role,
  action,
  module,
  entity_type,
  entity_id,
  previous_value,
  reason
)
SELECT
  'SYSTEM',
  'LEGACY_ROLE_ASSIGNMENT_REMOVED',
  'Authorization',
  'user_role',
  ur.id,
  jsonb_build_object('user_id', ur.user_id, 'role', ur.role::text),
  'President, Reviewing Supervisor, and Committee are no longer supported roles'
FROM public.user_roles ur
WHERE ur.role::text IN ('PRESIDENT', 'REVIEWING_SUPERVISOR', 'COMMITTEE');

DELETE FROM public.user_roles
WHERE role::text IN ('PRESIDENT', 'REVIEWING_SUPERVISOR', 'COMMITTEE');

UPDATE public.user_permissions
SET revoked_at = COALESCE(revoked_at, now()),
    reason = reason || ' (Revoked: legacy approval role retirement)'
WHERE revoked_at IS NULL
  AND (
    permission_code LIKE 'president.%'
    OR permission_code = 'evaluations.submit_president'
  );

DELETE FROM public.role_permissions
WHERE permission_code LIKE 'president.%'
   OR permission_code = 'evaluations.submit_president';

DELETE FROM public.roles
WHERE code::text IN ('PRESIDENT', 'REVIEWING_SUPERVISOR', 'COMMITTEE');

ALTER TABLE public.roles
  DROP CONSTRAINT IF EXISTS roles_supported_business_role;
ALTER TABLE public.roles
  ADD CONSTRAINT roles_supported_business_role
  CHECK (code::text IN (
    'EMPLOYEE',
    'SUPERVISOR',
    'DEPARTMENT_HEAD',
    'HR',
    'ADMINISTRATOR',
    'OPERATIONS_MANAGER'
  ));

ALTER TABLE public.user_roles
  DROP CONSTRAINT IF EXISTS user_roles_supported_business_role;
ALTER TABLE public.user_roles
  ADD CONSTRAINT user_roles_supported_business_role
  CHECK (role::text IN (
    'EMPLOYEE',
    'SUPERVISOR',
    'DEPARTMENT_HEAD',
    'HR',
    'ADMINISTRATOR',
    'OPERATIONS_MANAGER'
  ));

ALTER TABLE public.role_permissions
  DROP CONSTRAINT IF EXISTS role_permissions_supported_business_role;
ALTER TABLE public.role_permissions
  ADD CONSTRAINT role_permissions_supported_business_role
  CHECK (role_code::text IN (
    'EMPLOYEE',
    'SUPERVISOR',
    'DEPARTMENT_HEAD',
    'HR',
    'ADMINISTRATOR',
    'OPERATIONS_MANAGER'
  ));

ALTER TABLE public.role_permissions
  DROP CONSTRAINT IF EXISTS role_permissions_no_legacy_approval_permission;
ALTER TABLE public.role_permissions
  ADD CONSTRAINT role_permissions_no_legacy_approval_permission
  CHECK (
    permission_code NOT LIKE 'president.%'
    AND permission_code <> 'evaluations.submit_president'
  );

ALTER TABLE public.user_permissions
  DROP CONSTRAINT IF EXISTS user_permissions_no_active_legacy_approval_permission;
ALTER TABLE public.user_permissions
  ADD CONSTRAINT user_permissions_no_active_legacy_approval_permission
  CHECK (
    revoked_at IS NOT NULL
    OR (
      permission_code NOT LIKE 'president.%'
      AND permission_code <> 'evaluations.submit_president'
    )
  );
