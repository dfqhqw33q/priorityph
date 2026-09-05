import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  assignRolesSchema,
  rolePermissionsSchema,
  userAccessActionSchema,
  userFormSchema,
  userUpdateSchema,
  auditFiltersSchema,
  employeeProfileSchema,
} from "./schemas";
import type { AppRole, Permission } from "./domain";

export type InternalUserRow = {
  id: string;
  email: string;
  full_name: string;
  job_title: string | null;
  is_active: boolean;
  is_locked: boolean;
  must_change_password: boolean;
  last_login_at: string | null;
  created_at: string;
  roles: AppRole[];
};

export const listUsers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<InternalUserRow[]> => {
    const { getAdmin, requirePermission } = await import("./server-core.server");
    await requirePermission(context.userId, "users.view", "User Management");
    const admin = await getAdmin();
    const { data: users } = await admin
      .from("internal_users")
      .select(
        "id, email, full_name, job_title, is_active, is_locked, must_change_password, last_login_at, created_at",
      )
      .order("created_at", { ascending: false });
    const { data: roles } = await admin.from("user_roles").select("user_id, role");
    return (users ?? []).map((user) => ({
      ...user,
      roles: (roles ?? []).filter((r) => r.user_id === user.id).map((r) => r.role as AppRole),
    }));
  });

export const createUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => userFormSchema.parse(input))
  .handler(async ({ data, context }) => {
    const {
      getAdmin,
      requirePermission,
      writeAudit,
      getActorRoles,
      validationError,
      safeMessage,
      randomPassword,
    } = await import("./server-core.server");
    await requirePermission(context.userId, "users.manage", "User Management");
    const admin = await getAdmin();
    try {
      const tempPassword = randomPassword();
      const { data: created, error } = await admin.auth.admin.createUser({
        email: data.email,
        password: tempPassword,
        email_confirm: true,
        user_metadata: { full_name: data.fullName },
      });
      if (error || !created.user)
        throw validationError(error?.message ?? "Could not create the account");

      const userId = created.user.id;
      const { error: profileError } = await admin.from("internal_users").insert({
        id: userId,
        email: data.email,
        full_name: data.fullName,
        job_title: data.jobTitle,
        created_by: context.userId,
        must_change_password: true,
      });
      if (profileError) throw validationError(profileError.message);
      await admin.from("user_roles").insert(data.roles.map((role) => ({ user_id: userId, role })));

      await writeAudit({
        actorUserId: context.userId,
        actorRole: (await getActorRoles(context.userId)).join(","),
        action: "USER_CREATED",
        module: "User Management",
        entityType: "internal_user",
        entityId: userId,
        newValue: { email: data.email, fullName: data.fullName, roles: data.roles },
      });
      return { userId, temporaryPassword: tempPassword };
    } catch (error) {
      throw new Error(safeMessage(error, "Could not create the user"));
    }
  });

export const updateUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => userUpdateSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { getAdmin, requirePermission, writeAudit, getActorRoles, validationError } =
      await import("./server-core.server");
    await requirePermission(context.userId, "users.manage", "User Management");
    const admin = await getAdmin();
    const { data: before } = await admin
      .from("internal_users")
      .select("full_name, job_title")
      .eq("id", data.userId)
      .maybeSingle();
    const { error } = await admin
      .from("internal_users")
      .update({ full_name: data.fullName, job_title: data.jobTitle })
      .eq("id", data.userId);
    if (error) throw validationError(error.message);
    await writeAudit({
      actorUserId: context.userId,
      actorRole: (await getActorRoles(context.userId)).join(","),
      action: "USER_UPDATED",
      module: "User Management",
      entityType: "internal_user",
      entityId: data.userId,
      previousValue: before,
      newValue: { full_name: data.fullName, job_title: data.jobTitle },
    });
    return { ok: true };
  });

export const applyUserAccessAction = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => userAccessActionSchema.parse(input))
  .handler(async ({ data, context }) => {
    const {
      getAdmin,
      requirePermission,
      writeAudit,
      getActorRoles,
      validationError,
      safeMessage,
      randomPassword,
    } = await import("./server-core.server");
    const permission: Permission =
      data.action === "RESET_PASSWORD" || data.action === "REQUIRE_PASSWORD_CHANGE"
        ? "users.reset_password"
        : data.action === "REVOKE_SESSIONS"
          ? "users.revoke_sessions"
          : "users.manage";
    await requirePermission(context.userId, permission, "User Management");
    const admin = await getAdmin();

    try {
      let result: { ok: boolean; temporaryPassword: string | null } = {
        ok: true,
        temporaryPassword: null,
      };
      if (data.action === "ACTIVATE" || data.action === "DEACTIVATE") {
        const { error } = await admin
          .from("internal_users")
          .update({ is_active: data.action === "ACTIVATE" })
          .eq("id", data.userId);
        if (error) throw validationError(error.message);
      } else if (data.action === "LOCK" || data.action === "UNLOCK") {
        const { error } = await admin
          .from("internal_users")
          .update({ is_locked: data.action === "LOCK" })
          .eq("id", data.userId);
        if (error) throw validationError(error.message);
      } else if (data.action === "REQUIRE_PASSWORD_CHANGE") {
        await admin
          .from("internal_users")
          .update({ must_change_password: true })
          .eq("id", data.userId);
      } else if (data.action === "RESET_PASSWORD") {
        const tempPassword = randomPassword();
        const { error } = await admin.auth.admin.updateUserById(data.userId, {
          password: tempPassword,
        });
        if (error) throw validationError(error.message);
        await admin
          .from("internal_users")
          .update({ must_change_password: true })
          .eq("id", data.userId);
        await admin.from("password_reset_events").insert({
          user_id: data.userId,
          event_type: "ADMIN_PASSWORD_RESET",
        });
        result = { ok: true, temporaryPassword: tempPassword };
      } else if (data.action === "REVOKE_SESSIONS") {
        await admin.auth.admin.signOut(data.userId, "global").catch(() => undefined);
      }

      await writeAudit({
        actorUserId: context.userId,
        actorRole: (await getActorRoles(context.userId)).join(","),
        action: `USER_${data.action}`,
        module: "User Management",
        entityType: "internal_user",
        entityId: data.userId,
        reason: data.reason,
      });
      return result;
    } catch (error) {
      throw new Error(safeMessage(error, "Could not apply the change"));
    }
  });

export const assignRoles = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => assignRolesSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { getAdmin, requirePermission, writeAudit, getActorRoles, validationError, safeMessage } =
      await import("./server-core.server");
    await requirePermission(context.userId, "users.assign_roles", "User Management");
    const admin = await getAdmin();
    const { data: before } = await admin
      .from("user_roles")
      .select("role")
      .eq("user_id", data.userId);
    const current = (before ?? []).map((r) => r.role as AppRole);
    const removed = current.filter((role) => !data.roles.includes(role));
    const added = data.roles.filter((role) => !current.includes(role));

    try {
      for (const role of removed) {
        const { error } = await admin
          .from("user_roles")
          .delete()
          .eq("user_id", data.userId)
          .eq("role", role);
        if (error) throw validationError(error.message);
      }
      if (added.length > 0) {
        const { error } = await admin
          .from("user_roles")
          .insert(added.map((role) => ({ user_id: data.userId, role })));
        if (error) throw validationError(error.message);
      }
      await writeAudit({
        actorUserId: context.userId,
        actorRole: (await getActorRoles(context.userId)).join(","),
        action: "USER_ROLES_ASSIGNED",
        module: "User Management",
        entityType: "internal_user",
        entityId: data.userId,
        previousValue: { roles: current },
        newValue: { roles: data.roles },
        reason: data.reason,
      });
      return { ok: true };
    } catch (error) {
      throw new Error(safeMessage(error, "Could not update the roles"));
    }
  });

export const listRoleMatrix = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { getAdmin, requirePermission } = await import("./server-core.server");
    await requirePermission(context.userId, "roles.manage", "Roles & Permissions");
    const admin = await getAdmin();
    const [{ data: roles }, { data: permissions }, { data: mapping }] = await Promise.all([
      admin.from("roles").select("code, name, description").order("code"),
      admin.from("permissions").select("code, module, description").order("code"),
      admin.from("role_permissions").select("role_code, permission_code"),
    ]);
    return { roles: roles ?? [], permissions: permissions ?? [], mapping: mapping ?? [] };
  });

export const setRolePermissions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => rolePermissionsSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { getAdmin, requirePermission, writeAudit, getActorRoles, validationError } =
      await import("./server-core.server");
    await requirePermission(context.userId, "permissions.manage", "Roles & Permissions");
    const admin = await getAdmin();

    if (data.role === "ADMINISTRATOR" && !data.permissions.includes("permissions.manage"))
      throw validationError("Administrators must keep permission management access");

    const { data: before } = await admin
      .from("role_permissions")
      .select("permission_code")
      .eq("role_code", data.role);
    await admin.from("role_permissions").delete().eq("role_code", data.role);
    if (data.permissions.length > 0) {
      const { error } = await admin
        .from("role_permissions")
        .insert(
          data.permissions.map((permission) => ({
            role_code: data.role,
            permission_code: permission,
          })),
        );
      if (error) throw validationError(error.message);
    }
    await writeAudit({
      actorUserId: context.userId,
      actorRole: (await getActorRoles(context.userId)).join(","),
      action: "ROLE_PERMISSIONS_UPDATED",
      module: "Roles & Permissions",
      entityType: "role",
      entityId: null,
      previousValue: { role: data.role, permissions: (before ?? []).map((p) => p.permission_code) },
      newValue: { role: data.role, permissions: data.permissions },
      reason: data.reason,
    });
    return { ok: true };
  });

export const listAuditLogs = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        search: z.string().max(120).default(""),
        limit: z.number().int().min(1).max(500).default(200),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { getAdmin, requirePermission } = await import("./server-core.server");
    await requirePermission(context.userId, "audit.view", "Audit Logs");
    const admin = await getAdmin();
    let query = admin
      .from("audit_logs")
      .select("*")
      .order("occurred_at", { ascending: false })
      .limit(data.limit);
    if (data.search.trim()) {
      const term = `%${data.search.trim()}%`;
      query = query.or(`action.ilike.${term},module.ilike.${term}`);
    }
    const { data: rows } = await query;
    return rows ?? [];
  });

export const listEmployees = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { getAdmin, requirePermission } = await import("./server-core.server");
    await requirePermission(context.userId, "employees.view", "Employees");
    const admin = await getAdmin();
    const { data } = await admin.from("employees").select("*").order("employee_number");
    return data ?? [];
  });

export const createEmployeeProfile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => employeeProfileSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { getAdmin, requirePermission, writeAudit, getActorRoles, validationError } =
      await import("./server-core.server");
    await requirePermission(context.userId, "employees.manage", "Employee Profiles");
    const admin = await getAdmin();
    const fullName = [data.firstName, data.middleName, data.lastName].filter(Boolean).join(" ");
    const { data: employee, error } = await admin
      .from("employees")
      .insert({
        employee_number: data.employeeNumber,
        full_name: fullName,
        first_name: data.firstName,
        middle_name: data.middleName,
        last_name: data.lastName,
        job_title: data.jobTitle,
        division: data.division,
        section: data.section,
      } as never)
      .select("id")
      .single();
    if (error || !employee) {
      if (error?.code === "23505")
        throw validationError("An employee profile with that number already exists");
      throw validationError(error?.message ?? "Could not create employee profile");
    }
    await writeAudit({
      actorUserId: context.userId,
      actorRole: (await getActorRoles(context.userId)).join(","),
      action: "EMPLOYEE_PROFILE_CREATED",
      module: "Employee Profiles",
      entityType: "employee",
      entityId: employee.id,
      employeeId: employee.id,
      newValue: {
        employee_number: data.employeeNumber,
        first_name: data.firstName,
        middle_name: data.middleName,
        last_name: data.lastName,
      },
    });
    return { employeeId: employee.id };
  });

export const updateEmployeeProfile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    employeeProfileSchema.extend({ employeeId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { getAdmin, requirePermission, writeAudit, getActorRoles, validationError } =
      await import("./server-core.server");
    await requirePermission(context.userId, "employees.manage", "Employee Profiles");
    const admin = await getAdmin();
    const { data: previous } = await admin
      .from("employees")
      .select("*")
      .eq("id", data.employeeId)
      .maybeSingle();
    if (!previous) throw validationError("Employee profile not found");
    const fullName = [data.firstName, data.middleName, data.lastName].filter(Boolean).join(" ");
    const { error } = await admin
      .from("employees")
      .update({
        employee_number: data.employeeNumber,
        full_name: fullName,
        first_name: data.firstName,
        middle_name: data.middleName,
        last_name: data.lastName,
        job_title: data.jobTitle,
        division: data.division,
        section: data.section,
      } as never)
      .eq("id", data.employeeId);
    if (error)
      throw validationError(
        error.code === "23505"
          ? "An employee profile with that number already exists"
          : error.message,
      );
    await writeAudit({
      actorUserId: context.userId,
      actorRole: (await getActorRoles(context.userId)).join(","),
      action: "EMPLOYEE_PROFILE_UPDATED",
      module: "Employee Profiles",
      entityType: "employee",
      entityId: data.employeeId,
      employeeId: data.employeeId,
      previousValue: previous,
      newValue: {
        employee_number: data.employeeNumber,
        first_name: data.firstName,
        middle_name: data.middleName,
        last_name: data.lastName,
      },
    });
    return { employeeId: data.employeeId };
  });

export const getAdminStats = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { requirePermission, adminStats, recentActivity, recentSecurityEvents } =
      await import("./server-core.server");
    await requirePermission(context.userId, "users.view", "Administration");
    const [stats, activity, security] = await Promise.all([
      adminStats(),
      recentActivity(["User Management", "Roles & Permissions", "Evaluation Cycles"]),
      recentSecurityEvents(),
    ]);
    return { ...stats, activity, security };
  });

/** Read-only, filterable audit trail. Access itself is audited. */
export const listAuditEvents = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => auditFiltersSchema.parse(input ?? {}))
  .handler(async ({ data, context }) => {
    const { getAdmin, requirePermission, writeAudit, getActorRoles } =
      await import("./server-core.server");
    await requirePermission(context.userId, "audit.view", "Audit Logs");
    const admin = await getAdmin();

    let query = admin
      .from("audit_logs")
      .select("*")
      .order("occurred_at", { ascending: false })
      .limit(data.limit);

    const clean = (value: string) => value.trim().replace(/[%,()]/g, "");
    if (clean(data.search)) {
      const term = `%${clean(data.search)}%`;
      query = query.or(
        `action.ilike.${term},module.ilike.${term},entity_type.ilike.${term},reason.ilike.${term}`,
      );
    }
    if (data.from) query = query.gte("occurred_at", new Date(data.from).toISOString());
    if (data.to) query = query.lte("occurred_at", new Date(data.to).toISOString());
    if (clean(data.actor)) query = query.eq("actor_user_id", data.actor.trim());
    if (clean(data.role)) query = query.ilike("actor_role", `%${clean(data.role)}%`);
    if (clean(data.module)) query = query.eq("module", data.module.trim());
    if (clean(data.action)) query = query.eq("action", data.action.trim());
    if (clean(data.entityType)) query = query.eq("entity_type", data.entityType.trim());
    if (clean(data.result)) query = query.eq("result", data.result.trim());

    const [{ data: rows }, { data: actors }] = await Promise.all([
      query,
      admin.from("internal_users").select("id, full_name, email"),
    ]);

    await writeAudit({
      actorUserId: context.userId,
      actorRole: (await getActorRoles(context.userId)).join(","),
      action: "AUDIT_LOG_ACCESSED",
      module: "Audit Logs",
      newValue: { filters: { ...data, search: clean(data.search) } },
    });

    return { rows: rows ?? [], actors: actors ?? [] };
  });

export const getEmployeeRecord = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ employeeId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { getAdmin, requirePermission } = await import("./server-core.server");
    await requirePermission(context.userId, "evaluations.view_201", "Digital 201 File");
    const admin = await getAdmin();
    const { data: employee } = await admin
      .from("employees")
      .select("*")
      .eq("id", data.employeeId)
      .maybeSingle();
    if (!employee) return null;
    const { data: history } = await admin
      .from("evaluations")
      .select(
        "id, status, employee_submitted_at, supervisor_submitted_at, full_name_snapshot, job_title_snapshot, division_snapshot, section_snapshot, evaluation_cycles(name, year)",
      )
      .eq("employee_id", data.employeeId)
      .order("employee_submitted_at", { ascending: false });
    return {
      employee,
      history: (history ?? []).map((row) => {
        const record = row as unknown as Record<string, unknown>;
        const cycle = record["evaluation_cycles"] as { name: string; year: number } | null;
        return {
          id: String(record["id"]),
          status: String(record["status"]),
          employee_submitted_at: (record["employee_submitted_at"] as string | null) ?? null,
          supervisor_submitted_at: (record["supervisor_submitted_at"] as string | null) ?? null,
          job_title_snapshot: String(record["job_title_snapshot"] ?? ""),
          division_snapshot: String(record["division_snapshot"] ?? ""),
          section_snapshot: String(record["section_snapshot"] ?? ""),
          cycle_name: cycle?.name ?? "",
          cycle_year: cycle?.year ?? 0,
        };
      }),
    };
  });

export const getUserSecurityDetail = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ userId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { getAdmin, requirePermission } = await import("./server-core.server");
    await requirePermission(context.userId, "users.view", "User Management");
    const admin = await getAdmin();
    const [{ data: roles }, { data: logins }] = await Promise.all([
      admin.from("user_roles").select("role").eq("user_id", data.userId),
      admin
        .from("login_events")
        .select("id, occurred_at, event_type, result")
        .eq("user_id", data.userId)
        .order("occurred_at", { ascending: false })
        .limit(10),
    ]);
    const roleCodes = (roles ?? []).map((r) => r.role as AppRole);
    let permissions: Permission[] = [];
    if (roleCodes.length > 0) {
      const { data: perms } = await admin
        .from("role_permissions")
        .select("permission_code")
        .in("role_code", roleCodes);
      permissions = Array.from(new Set((perms ?? []).map((p) => p.permission_code as Permission)));
    }
    return { roles: roleCodes, permissions, logins: logins ?? [] };
  });
