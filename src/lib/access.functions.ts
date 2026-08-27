import { createServerFn } from "@tanstack/react-start";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { bootstrapAdminSchema } from "./schemas";
import type { AppRole, Permission } from "./domain";

export type AccessProfile = {
  userId: string;
  email: string;
  fullName: string;
  jobTitle: string | null;
  isActive: boolean;
  isLocked: boolean;
  mustChangePassword: boolean;
  roles: AppRole[];
  permissions: Permission[];
};

export const getMyAccess = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<AccessProfile | null> => {
    const { getAdmin } = await import("./server-core.server");
    const admin = await getAdmin();
    const userId = context.userId;

    const { data: user } = await admin
      .from("internal_users")
      .select("id, email, full_name, job_title, is_active, is_locked, must_change_password")
      .eq("id", userId)
      .maybeSingle();
    if (!user) return null;

    const { data: roleRows } = await admin.from("user_roles").select("role").eq("user_id", userId);
    const roles = (roleRows ?? []).map((r) => r.role as AppRole);

    let permissions: Permission[] = [];
    if (roles.length > 0 && user.is_active && !user.is_locked) {
      const { data: permRows } = await admin
        .from("role_permissions")
        .select("permission_code")
        .in("role_code", roles);
      permissions = Array.from(new Set((permRows ?? []).map((r) => r.permission_code as Permission)));
    }

    return {
      userId,
      email: user.email,
      fullName: user.full_name,
      jobTitle: user.job_title,
      isActive: user.is_active,
      isLocked: user.is_locked,
      mustChangePassword: user.must_change_password,
      roles,
      permissions,
    };
  });

export const recordLoginEvent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { event: "LOGIN" | "LOGOUT" | "PASSWORD_CHANGED" }) => input)
  .handler(async ({ data, context }) => {
    const { getAdmin, writeAudit, getRequestMeta, getActorRoles } = await import("./server-core.server");
    const admin = await getAdmin();
    const meta = getRequestMeta();
    const roles = await getActorRoles(context.userId);

    if (data.event === "LOGIN") {
      await admin
        .from("internal_users")
        .update({ last_login_at: new Date().toISOString() })
        .eq("id", context.userId);
    }
    if (data.event === "PASSWORD_CHANGED") {
      await admin
        .from("internal_users")
        .update({ must_change_password: false })
        .eq("id", context.userId);
      await admin.from("password_reset_events").insert({
        user_id: context.userId,
        event_type: "PASSWORD_CHANGED",
        ip_address: meta.ip,
        user_agent: meta.userAgent,
      });
    }

    await admin.from("login_events").insert({
      user_id: context.userId,
      event_type: data.event,
      result: "SUCCESS",
      ip_address: meta.ip,
      user_agent: meta.userAgent,
    });
    await writeAudit(
      {
        actorUserId: context.userId,
        actorRole: roles.join(","),
        action: data.event,
        module: "Authentication",
        entityType: "internal_user",
        entityId: context.userId,
      },
      meta,
    );
    return { ok: true };
  });

export const recordAuthFailure = createServerFn({ method: "POST" })
  .inputValidator((input: { email: string; event: "LOGIN_FAILED" | "PASSWORD_RESET_REQUESTED" }) => ({
    email: String(input.email).slice(0, 200),
    event: input.event,
  }))
  .handler(async ({ data }) => {
    const { getAdmin, writeAudit, getRequestMeta } = await import("./server-core.server");
    const admin = await getAdmin();
    const meta = getRequestMeta();
    if (data.event === "LOGIN_FAILED") {
      await admin.from("login_events").insert({
        email: data.email,
        event_type: "LOGIN_FAILED",
        result: "FAILURE",
        ip_address: meta.ip,
        user_agent: meta.userAgent,
      });
    } else {
      await admin.from("password_reset_events").insert({
        email: data.email,
        event_type: "PASSWORD_RESET_REQUESTED",
        ip_address: meta.ip,
        user_agent: meta.userAgent,
      });
    }
    await writeAudit(
      {
        action: data.event,
        module: "Authentication",
        newValue: { email: data.email },
        result: data.event === "LOGIN_FAILED" ? "FAILURE" : "SUCCESS",
      },
      meta,
    );
    return { ok: true };
  });

/** True only while the system has no internal users at all. */
export const needsBootstrap = createServerFn({ method: "GET" }).handler(async () => {
  const { getAdmin } = await import("./server-core.server");
  const admin = await getAdmin();
  const { count } = await admin.from("internal_users").select("id", { count: "exact", head: true });
  return { needsBootstrap: (count ?? 0) === 0 };
});

/** One-time creation of the first Administrator. Refuses once any internal user exists. */
export const bootstrapAdministrator = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => bootstrapAdminSchema.parse(input))
  .handler(async ({ data }) => {
    const { getAdmin, writeAudit, validationError, safeMessage } = await import("./server-core.server");
    const admin = await getAdmin();
    const { count } = await admin.from("internal_users").select("id", { count: "exact", head: true });
    if ((count ?? 0) > 0) throw validationError("Initial setup has already been completed");

    try {
      const { data: created, error } = await admin.auth.admin.createUser({
        email: data.email,
        password: data.password,
        email_confirm: true,
        user_metadata: { full_name: data.fullName },
      });
      if (error || !created.user) throw new Error(error?.message ?? "Could not create the account");

      const userId = created.user.id;
      const { error: profileError } = await admin.from("internal_users").insert({
        id: userId,
        email: data.email,
        full_name: data.fullName,
        must_change_password: false,
      });
      if (profileError) throw new Error(profileError.message);
      const { error: roleError } = await admin
        .from("user_roles")
        .insert({ user_id: userId, role: "ADMINISTRATOR" });
      if (roleError) throw new Error(roleError.message);

      await writeAudit({
        actorUserId: userId,
        actorRole: "ADMINISTRATOR",
        action: "BOOTSTRAP_ADMINISTRATOR_CREATED",
        module: "User Management",
        entityType: "internal_user",
        entityId: userId,
        newValue: { email: data.email, roles: ["ADMINISTRATOR"] },
      });
      return { ok: true };
    } catch (error) {
      throw new Error(safeMessage(error, "Initial setup failed"));
    }
  });
