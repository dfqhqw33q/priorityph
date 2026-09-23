import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import {
  authenticateSupabaseRequest,
  requireSupabaseAuth,
} from "@/integrations/supabase/auth-middleware";
import { accountPasswordChangeSchema, bootstrapAdminSchema, resetPasswordSchema } from "./schemas";
import { validatePassword } from "./password-policy";
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

export type AccountSettings = {
  userId: string;
  fullName: string;
  email: string;
  jobTitle: string | null;
  isActive: boolean;
  isLocked: boolean;
  mustChangePassword: boolean;
  lastLoginAt: string | null;
  roles: AppRole[];
  otpRequired: true;
  recentSecurityActivity: Array<{
    action: string;
    result: string;
    occurredAt: string;
  }>;
};

export const getMyAccountSettings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<AccountSettings> => {
    const { getAdmin } = await import("./server-core.server");
    const admin = await getAdmin();
    const [{ data: profile }, { data: roles }, { data: activity }] = await Promise.all([
      admin
        .from("internal_users")
        .select("id, full_name, email, job_title, is_active, is_locked, must_change_password, last_login_at")
        .eq("id", context.userId)
        .maybeSingle(),
      admin.from("user_roles").select("role").eq("user_id", context.userId),
      admin
        .from("audit_logs")
        .select("action, result, occurred_at")
        .eq("actor_user_id", context.userId)
        .eq("module", "Authentication")
        .order("occurred_at", { ascending: false })
        .limit(10),
    ]);
    if (!profile) throw new Error("Your internal account could not be found");
    return {
      userId: profile.id,
      fullName: profile.full_name,
      email: profile.email,
      jobTitle: profile.job_title,
      isActive: profile.is_active,
      isLocked: profile.is_locked,
      mustChangePassword: profile.must_change_password,
      lastLoginAt: profile.last_login_at,
      roles: (roles ?? []).map((row) => row.role as AppRole),
      otpRequired: true,
      recentSecurityActivity: (activity ?? []).map((row) => ({
        action: row.action,
        result: row.result,
        occurredAt: row.occurred_at,
      })),
    };
  });

export const updateMyProfile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => z.object({ fullName: z.string().trim().min(2).max(160) }).parse(input))
  .handler(async ({ data, context }) => {
    const { getAdmin, getActorRoles, writeAudit, validationError } = await import("./server-core.server");
    const admin = await getAdmin();
    const { data: previous } = await admin.from("internal_users").select("full_name").eq("id", context.userId).maybeSingle();
    const { error } = await admin.from("internal_users").update({ full_name: data.fullName }).eq("id", context.userId);
    if (error) throw validationError(error.message);
    await writeAudit({
      actorUserId: context.userId,
      actorRole: (await getActorRoles(context.userId)).join(","),
      action: "PROFILE_UPDATED",
      module: "Authentication",
      entityType: "internal_user",
      entityId: context.userId,
      previousValue: previous,
      newValue: { full_name: data.fullName },
    });
    return { ok: true };
  });

export const changeMyAccountPassword = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => accountPasswordChangeSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { getAdmin, getActorRoles, getRequestMeta, writeAudit, validationError } = await import("./server-core.server");
    const admin = await getAdmin();
    const { data: profile } = await admin.from("internal_users").select("email, full_name").eq("id", context.userId).maybeSingle();
    if (!profile) throw validationError("Your internal account could not be found");
    const passwordCheck = validatePassword(data.password, [profile.full_name, profile.email]);
    if (!passwordCheck.valid) throw validationError(passwordCheck.errors[0]);
    const url = process.env["SUPABASE_URL"];
    const key = process.env["SUPABASE_PUBLISHABLE_KEY"];
    if (!url || !key) throw validationError("Password re-authentication is unavailable");
    const { createClient } = await import("@supabase/supabase-js");
    const verifier = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
    const { error: reauthError } = await verifier.auth.signInWithPassword({ email: profile.email, password: data.currentPassword });
    await verifier.auth.signOut().catch(() => undefined);
    if (reauthError) throw validationError("The current password is incorrect");
    const { error } = await admin.auth.admin.updateUserById(context.userId, { password: data.password });
    if (error) throw validationError(error.message);
    await admin.auth.admin.signOut(context.userId, "others");
    const meta = getRequestMeta();
    await writeAudit({
      actorUserId: context.userId,
      actorRole: (await getActorRoles(context.userId)).join(","),
      action: "PASSWORD_CHANGED",
      module: "Authentication",
      entityType: "internal_user",
      entityId: context.userId,
    }, meta);
    return { ok: true };
  });

export const recordEmailSecurityEvent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => z.object({ event: z.enum(["EMAIL_CHANGE_REQUESTED", "EMAIL_VERIFIED"]) }).parse(input))
  .handler(async ({ data, context }) => {
    const { getActorRoles, writeAudit } = await import("./server-core.server");
    await writeAudit({
      actorUserId: context.userId,
      actorRole: (await getActorRoles(context.userId)).join(","),
      action: data.event,
      module: "Authentication",
      entityType: "internal_user",
      entityId: context.userId,
    });
    return { ok: true };
  });

export const getMyAccess = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<AccessProfile | null> => {
    const { getAdmin } = await import("./server-core.server");
    const admin = await getAdmin();
    const userId = context.userId;

    const [{ data: user }, { data: roleRows }] = await Promise.all([
      admin
        .from("internal_users")
        .select("id, email, full_name, job_title, is_active, is_locked, must_change_password")
        .eq("id", userId)
        .maybeSingle(),
      admin.from("user_roles").select("role").eq("user_id", userId),
    ]);
    if (!user) return null;

    const roles = (roleRows ?? []).map((r) => r.role as AppRole);

    let permissions: Permission[] = [];
    if (roles.length > 0 && user.is_active && !user.is_locked) {
      const { data: permRows } = await admin
        .from("role_permissions")
        .select("permission_code")
        .in("role_code", roles);
      permissions = Array.from(
        new Set((permRows ?? []).map((r) => r.permission_code as Permission)),
      );
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

export const beginEmailMfa = createServerFn({ method: "POST" })
  .validator((input: unknown) => z.object({}).parse(input ?? {}))
  .handler(async () => {
    const authenticated = await authenticateSupabaseRequest();
    const { getAdmin, generateEmailOtp, hashEmailOtp, sendEmailOtp, writeAudit, getActorRoles } =
      await import("./server-core.server");
    const admin = await getAdmin();
    const sessionId = String(authenticated.claims.session_id ?? "");
    if (!sessionId) throw new Error("MFA could not be started for this session");
    const { data: recentChallenge } = await (admin.from("email_mfa_challenges" as never) as any)
      .select("created_at")
      .eq("user_id", authenticated.userId)
      .eq("session_id", sessionId)
      .gt("created_at", new Date(Date.now() - 30_000).toISOString())
      .maybeSingle();
    if (recentChallenge)
      throw new Error("Please wait before requesting another verification code.");
    const { data: profile } = await admin
      .from("internal_users")
      .select("email, full_name")
      .eq("id", authenticated.userId)
      .maybeSingle();
    if (!profile) throw new Error("Your internal account could not be found");
    const otp = generateEmailOtp();
    const otpHash = await hashEmailOtp(otp);
    const challengeTable = admin.from("email_mfa_challenges" as never) as any;
    await challengeTable.delete().eq("user_id", authenticated.userId).eq("session_id", sessionId);
    const { data: challenge, error } = await challengeTable
      .insert({
        user_id: authenticated.userId,
        session_id: sessionId,
        otp_hash: otpHash,
        expires_at: new Date(Date.now() + 5 * 60_000).toISOString(),
      })
      .select("id")
      .single();
    if (error || !challenge) throw new Error("Could not start email verification");
    const delivery = await sendEmailOtp({ email: profile.email, fullName: profile.full_name, otp });
    if (!delivery.sent) {
      await challengeTable.delete().eq("id", challenge.id);
      await writeAudit({
        actorUserId: authenticated.userId,
        actorRole: (await getActorRoles(authenticated.userId)).join(","),
        action: "MFA_OTP_SEND_FAILED",
        module: "Authentication",
        entityType: "internal_user",
        entityId: authenticated.userId,
        reason: delivery.message,
        result: "FAILURE",
      });
      throw new Error(delivery.message);
    }
    await writeAudit({
      actorUserId: authenticated.userId,
      actorRole: (await getActorRoles(authenticated.userId)).join(","),
      action: "MFA_OTP_SENT",
      module: "Authentication",
      entityType: "internal_user",
      entityId: authenticated.userId,
      result: "SUCCESS",
    });
    return { challengeId: challenge.id, expiresInSeconds: 300 };
  });

export const verifyEmailMfa = createServerFn({ method: "POST" })
  .validator((input: unknown) =>
    z.object({ challengeId: z.string().uuid(), otp: z.string().regex(/^\d{6}$/) }).parse(input),
  )
  .handler(async ({ data }) => {
    const authenticated = await authenticateSupabaseRequest();
    const { getAdmin, getActorRoles, hashEmailOtp, writeAudit } =
      await import("./server-core.server");
    const admin = await getAdmin();
    const sessionId = String(authenticated.claims.session_id ?? "");
    const challengeTable = admin.from("email_mfa_challenges" as never) as any;
    const { data: challenge } = await challengeTable
      .select("id, otp_hash, attempts, expires_at, verified_at")
      .eq("id", data.challengeId)
      .eq("user_id", authenticated.userId)
      .eq("session_id", sessionId)
      .maybeSingle();
    const roles = (await getActorRoles(authenticated.userId)).join(",");
    if (
      !challenge ||
      challenge.verified_at ||
      challenge.attempts >= 5 ||
      new Date(challenge.expires_at).getTime() <= Date.now() ||
      (await hashEmailOtp(data.otp)) !== challenge.otp_hash
    ) {
      if (challenge && challenge.attempts < 5)
        await challengeTable.update({ attempts: challenge.attempts + 1 }).eq("id", challenge.id);
      await writeAudit({
        actorUserId: authenticated.userId,
        actorRole: roles,
        action: "MFA_OTP_FAILED",
        module: "Authentication",
        entityType: "internal_user",
        entityId: authenticated.userId,
        result: "FAILURE",
      });
      throw new Error("The verification code is invalid or expired.");
    }
    await challengeTable.update({ verified_at: new Date().toISOString() }).eq("id", challenge.id);
    await writeAudit({
      actorUserId: authenticated.userId,
      actorRole: roles,
      action: "MFA_OTP_VERIFIED",
      module: "Authentication",
      entityType: "internal_user",
      entityId: authenticated.userId,
      result: "SUCCESS",
    });
    return { ok: true };
  });

export const recordLoginEvent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { event: "LOGIN" | "LOGOUT" | "PASSWORD_CHANGED" }) => input)
  .handler(async ({ data, context }) => {
    const { getAdmin, writeAudit, getRequestMeta, getActorRoles } =
      await import("./server-core.server");
    const admin = await getAdmin();
    const meta = getRequestMeta();
    const roles = await getActorRoles(context.userId);

    const writes: Promise<unknown>[] = [
      Promise.resolve(
        admin.from("login_events").insert({
          user_id: context.userId,
          event_type: data.event,
          result: "SUCCESS",
          ip_address: meta.ip,
          user_agent: meta.userAgent,
        }),
      ),
      writeAudit(
        {
          actorUserId: context.userId,
          actorRole: roles.join(","),
          action: data.event,
          module: "Authentication",
          entityType: "internal_user",
          entityId: context.userId,
        },
        meta,
      ),
    ];
    if (data.event === "LOGIN") {
      writes.push(
        Promise.resolve(
          admin
            .from("internal_users")
            .update({ last_login_at: new Date().toISOString() })
            .eq("id", context.userId),
        ),
      );
    }
    if (data.event === "PASSWORD_CHANGED") {
      writes.push(
        Promise.resolve(
          admin
            .from("internal_users")
            .update({ must_change_password: false })
            .eq("id", context.userId),
        ),
        Promise.resolve(
          admin.from("password_reset_events").insert({
            user_id: context.userId,
            event_type: "PASSWORD_CHANGED",
            ip_address: meta.ip,
            user_agent: meta.userAgent,
          }),
        ),
      );
    }
    await Promise.all(writes);
    return { ok: true };
  });

export const changeMyPassword = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => resetPasswordSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { getAdmin, getActorRoles, getRequestMeta, writeAudit, validationError } =
      await import("./server-core.server");
    const admin = await getAdmin();
    const { data: profile } = await admin
      .from("internal_users")
      .select("email, full_name")
      .eq("id", context.userId)
      .maybeSingle();
    if (!profile) throw validationError("Your internal account could not be found");
    const passwordCheck = validatePassword(data.password, [profile.full_name, profile.email]);
    if (!passwordCheck.valid) throw validationError(passwordCheck.errors[0]);
    const { error } = await admin.auth.admin.updateUserById(context.userId, {
      password: data.password,
    });
    if (error) throw validationError(error.message);
    const { error: profileError } = await admin
      .from("internal_users")
      .update({ must_change_password: false })
      .eq("id", context.userId);
    if (profileError) throw validationError(profileError.message);
    const meta = getRequestMeta();
    const roles = await getActorRoles(context.userId);
    await Promise.all([
      admin.from("password_reset_events").insert({
        user_id: context.userId,
        event_type: "PASSWORD_CHANGED",
        ip_address: meta.ip,
        user_agent: meta.userAgent,
      }),
      writeAudit(
        {
          actorUserId: context.userId,
          actorRole: roles.join(","),
          action: "FORCED_PASSWORD_CHANGED",
          module: "Authentication",
          entityType: "internal_user",
          entityId: context.userId,
        },
        meta,
      ),
    ]);
    return { ok: true };
  });

export const recordAuthFailure = createServerFn({ method: "POST" })
  .validator((input: { email: string; event: "LOGIN_FAILED" | "PASSWORD_RESET_REQUESTED" }) => ({
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
  .validator((input: unknown) => bootstrapAdminSchema.parse(input))
  .handler(async ({ data }) => {
    const { getAdmin, writeAudit, validationError, safeMessage } =
      await import("./server-core.server");
    const passwordCheck = validatePassword(data.password, [data.fullName, data.email]);
    if (!passwordCheck.valid) throw validationError(passwordCheck.errors[0]);
    const admin = await getAdmin();
    const { count } = await admin
      .from("internal_users")
      .select("id", { count: "exact", head: true });
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
