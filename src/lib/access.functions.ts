import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import {
  authenticateSupabaseRequest,
  requireSupabaseAuth,
} from "@/integrations/supabase/auth-middleware";
import {
  accountPasswordChangeSchema,
  bootstrapInternalUserSchema,
  resetPasswordSchema,
} from "./schemas";
import { validatePassword } from "./password-policy";
import { normalizeRole, type AppRole, type Permission } from "./domain";

export type AccessProfile = {
  userId: string;
  email: string;
  emailConfirmedAt: string | null;
  fullName: string;
  jobTitle: string | null;
  isActive: boolean;
  isLocked: boolean;
  mustChangePassword: boolean;
  roles: AppRole[];
  permissions: Permission[];
};

export const syncMyConfirmedEmail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { getAdmin, getActorRoles, writeAudit } = await import("./server-core.server");
    const admin = await getAdmin();
    const { data: authResult } = await admin.auth.admin.getUserById(context.userId);
    const confirmedEmail = authResult.user?.email;
    if (!confirmedEmail || !authResult.user?.email_confirmed_at) return { updated: false };
    const { data: current } = await admin
      .from("internal_users")
      .select("email")
      .eq("id", context.userId)
      .maybeSingle();
    if (!current || current.email.toLowerCase() === confirmedEmail.toLowerCase())
      return { updated: false };
    const { error } = await admin
      .from("internal_users")
      .update({ email: confirmedEmail.toLowerCase() })
      .eq("id", context.userId);
    if (error) throw new Error(error.message);
    await writeAudit({
      actorUserId: context.userId,
      actorRole: (await getActorRoles(context.userId)).join(","),
      action: "EMAIL_VERIFIED",
      module: "Authentication",
      entityType: "internal_user",
      entityId: context.userId,
    });
    return { updated: true };
  });

export const updateMyProfile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) =>
    z.object({ fullName: z.string().trim().min(2).max(160) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { enforceRateLimit, getAdmin, getActorRoles, writeAudit, validationError } =
      await import("./server-core.server");
    const admin = await getAdmin();
    const { data: previous } = await admin
      .from("internal_users")
      .select("full_name")
      .eq("id", context.userId)
      .maybeSingle();
    const { error } = await admin
      .from("internal_users")
      .update({ full_name: data.fullName })
      .eq("id", context.userId);
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
    const { getAdmin, getActorRoles, getRequestMeta, requireStepUp, writeAudit, validationError } =
      await import("./server-core.server");
    await requireStepUp(
      context.userId,
      String(context.claims.session_id ?? ""),
      "change your password",
      true,
    );
    const admin = await getAdmin();
    const { data: profile } = await admin
      .from("internal_users")
      .select("email, full_name")
      .eq("id", context.userId)
      .maybeSingle();
    if (!profile) throw validationError("Your internal account could not be found");
    const passwordCheck = validatePassword(data.password, [profile.full_name, profile.email]);
    if (!passwordCheck.valid)
      throw validationError(passwordCheck.errors[0] ?? "Password is invalid");
    const url = process.env["SUPABASE_URL"];
    const key = process.env["SUPABASE_PUBLISHABLE_KEY"];
    if (!url || !key) throw validationError("Password re-authentication is unavailable");
    const { createClient } = await import("@supabase/supabase-js");
    const verifier = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { error: reauthError } = await verifier.auth.signInWithPassword({
      email: profile.email,
      password: data.currentPassword,
    });
    await verifier.auth.signOut().catch(() => undefined);
    if (reauthError) throw validationError("The current password is incorrect");
    const { error } = await admin.auth.admin.updateUserById(context.userId, {
      password: data.password,
    });
    if (error) throw validationError(error.message);
    await admin.auth.admin.signOut(context.userId, "others");
    const meta = getRequestMeta();
    await writeAudit(
      {
        actorUserId: context.userId,
        actorRole: (await getActorRoles(context.userId)).join(","),
        action: "PASSWORD_CHANGED",
        module: "Authentication",
        entityType: "internal_user",
        entityId: context.userId,
      },
      meta,
    );
    return { ok: true };
  });

export const beginStepUpAuthentication = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) =>
    z
      .object({ password: z.string().min(1), action: z.string().trim().min(1).max(120) })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { enforceRateLimit, getAdmin, getActorRoles, writeAudit, validationError } =
      await import("./server-core.server");
    const admin = await getAdmin();
    const sessionId = String(context.claims.session_id ?? "");
    if (!sessionId) throw validationError("Step-up authentication is unavailable");
    await enforceRateLimit(`step-up:${context.userId}:${sessionId}`, 300, 5);
    const { data: profile } = await admin
      .from("internal_users")
      .select("email, full_name")
      .eq("id", context.userId)
      .maybeSingle();
    if (!profile) throw validationError("Your internal account could not be found");
    const roles = (await getActorRoles(context.userId)).join(",");
    await writeAudit({
      actorUserId: context.userId,
      actorRole: roles,
      action: "STEP_UP_REQUESTED",
      module: "Authentication",
      entityType: "internal_user",
      entityId: context.userId,
    });
    const url = process.env["SUPABASE_URL"];
    const key = process.env["SUPABASE_PUBLISHABLE_KEY"];
    if (!url || !key) throw validationError("Step-up authentication is unavailable");
    const { createClient } = await import("@supabase/supabase-js");
    const verifier = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { error } = await verifier.auth.signInWithPassword({
      email: profile.email,
      password: data.password,
    });
    await verifier.auth.signOut().catch(() => undefined);
    if (error) {
      await writeAudit({
        actorUserId: context.userId,
        actorRole: roles,
        action: "STEP_UP_FAILED",
        module: "Authentication",
        entityType: "internal_user",
        entityId: context.userId,
        result: "FAILURE",
      });
      throw validationError("Identity verification failed");
    }
    const table = admin.from("security_elevations");
    const { error: elevationError } = await table.upsert(
      {
        user_id: context.userId,
        session_id: sessionId,
        action_key: data.action,
        elevated_at: new Date().toISOString(),
        expires_at: new Date(Date.now() + 10 * 60_000).toISOString(),
      } as never,
      { onConflict: "user_id,session_id,action_key" } as never,
    );
    if (elevationError) {
      console.error("[security] failed to persist step-up elevation", {
        userId: context.userId,
        action: data.action,
        message: elevationError.message,
      });
      throw validationError("Could not establish elevated access");
    }
    await writeAudit({
      actorUserId: context.userId,
      actorRole: roles,
      action: "STEP_UP_ELEVATED",
      module: "Authentication",
      entityType: "internal_user",
      entityId: context.userId,
      newValue: { action: data.action },
    });
    return { ok: true, expiresInSeconds: 600 };
  });

export const recordEmailSecurityEvent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) =>
    z.object({ event: z.enum(["EMAIL_CHANGE_REQUESTED", "EMAIL_VERIFIED"]) }).parse(input),
  )
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

    const [{ data: user, error: userError }, { data: roleRows, error: roleError }] =
      await Promise.all([
        admin
          .from("internal_users")
          .select("id, email, full_name, job_title, is_active, is_locked, must_change_password")
          .eq("id", userId)
          .maybeSingle(),
        admin.from("user_roles").select("role").eq("user_id", userId),
      ]);
    if (userError) throw new Error(`Could not load your account access: ${userError.message}`);
    if (roleError) throw new Error(`Could not load your account roles: ${roleError.message}`);
    if (!user) return null;

    const roles = (roleRows ?? []).map((row) => normalizeRole(row.role));
    if (roles.length !== 1 || roles.some((role) => role === null)) return null;
    const assignedRoles = roles.filter((role): role is AppRole => role !== null);
    const assignedRoleCodes = (roleRows ?? []).map((row) => row.role);
    const { data: authUser, error: authUserError } = await admin.auth.admin.getUserById(userId);
    if (authUserError) throw new Error("Could not verify the authenticated account.");

    let permissions: Permission[] = [];
    if (user.is_active && !user.is_locked) {
      const [
        { data: rolePermissionRows, error: rolePermissionError },
        { data: userPermissionRows, error: userPermissionError },
      ] = await Promise.all([
        admin.from("role_permissions").select("permission_code").in("role_code", assignedRoleCodes),
        admin
          .from("user_permissions")
          .select("permission_code")
          .eq("user_id", userId)
          .is("revoked_at", null),
      ]);
      if (rolePermissionError || userPermissionError)
        throw new Error("Could not verify account permissions.");
      permissions = Array.from(
        new Set([
          ...(rolePermissionRows ?? []).map((row) => row.permission_code as Permission),
          ...(userPermissionRows ?? []).map((row) => row.permission_code as Permission),
        ]),
      );
    }

    return {
      userId,
      email: user.email,
      emailConfirmedAt: authUser.user?.email_confirmed_at ?? null,
      fullName: user.full_name,
      jobTitle: user.job_title,
      isActive: user.is_active,
      isLocked: user.is_locked,
      mustChangePassword: user.must_change_password,
      roles: assignedRoles,
      permissions,
    };
  });

export const beginEmailMfa = createServerFn({ method: "POST" })
  .validator((input: unknown) => z.object({}).parse(input ?? {}))
  .handler(async () => {
    const authenticated = await authenticateSupabaseRequest();
    const {
      enforceRateLimit,
      getAdmin,
      generateEmailOtp,
      hashEmailOtp,
      sendEmailOtp,
      writeAudit,
      getActorRoles,
      isEmailOtpEnabled,
    } = await import("./server-core.server");
    const admin = await getAdmin();
    const sessionId = String(authenticated.claims.session_id ?? "");
    if (!sessionId) throw new Error("MFA could not be started for this session");
    if (!(await isEmailOtpEnabled())) {
      return { required: false, challengeId: null, expiresInSeconds: 0 };
    }
    await enforceRateLimit(`mfa-send:${authenticated.userId}:${sessionId}`, 300, 5);
    const { data: recentChallenge } = await admin
      .from("email_mfa_challenges")
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
    const challengeTable = admin.from("email_mfa_challenges");
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
    return { required: true, challengeId: challenge.id, expiresInSeconds: 300 };
  });

export const verifyEmailMfa = createServerFn({ method: "POST" })
  .validator((input: unknown) =>
    z.object({ challengeId: z.string().uuid(), otp: z.string().regex(/^\d{6}$/) }).parse(input),
  )
  .handler(async ({ data }) => {
    const authenticated = await authenticateSupabaseRequest();
    const {
      enforceRateLimit,
      getAdmin,
      getActorRoles,
      hashEmailOtp,
      isEmailOtpEnabled,
      writeAudit,
    } = await import("./server-core.server");
    if (!(await isEmailOtpEnabled())) return { ok: true };
    const admin = await getAdmin();
    const sessionId = String(authenticated.claims.session_id ?? "");
    await enforceRateLimit(`mfa-verify:${authenticated.userId}:${sessionId}`, 300, 10);
    const challengeTable = admin.from("email_mfa_challenges");
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
  .validator(
    (input: { event: "LOGIN" | "LOGOUT" | "SESSION_EXPIRED" | "PASSWORD_CHANGED" }) => input,
  )
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
    if (!passwordCheck.valid)
      throw validationError(passwordCheck.errors[0] ?? "Password is invalid");
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
  .validator((input: unknown) =>
    z
      .object({
        email: z.string().trim().email().max(200),
        event: z.enum(["LOGIN_FAILED", "PASSWORD_RESET_REQUESTED"]),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const { enforceRateLimit, getAdmin, writeAudit, getRequestMeta } =
      await import("./server-core.server");
    const admin = await getAdmin();
    const meta = getRequestMeta();
    await enforceRateLimit(
      `auth-failure:${data.event}:${meta.ip ?? "unknown"}:${data.email.toLowerCase()}`,
      300,
      data.event === "LOGIN_FAILED" ? 10 : 5,
    );
    if (data.event === "LOGIN_FAILED") {
      const email = data.email.toLowerCase();
      const { error: insertError } = await admin.from("login_events").insert({
        email,
        event_type: "LOGIN_FAILED",
        result: "FAILURE",
        ip_address: meta.ip,
        user_agent: meta.userAgent,
      });
      if (insertError) throw new Error("Could not record the sign-in failure");

      const lockoutWindowStart = new Date(Date.now() - 15 * 60_000).toISOString();
      const { count, error: countError } = await admin
        .from("login_events")
        .select("id", { count: "exact", head: true })
        .eq("email", email)
        .eq("event_type", "LOGIN_FAILED")
        .gte("occurred_at", lockoutWindowStart);
      if (countError) throw new Error("Could not check sign-in failures");
      if ((count ?? 0) >= 5) {
        const { data: lockedAccount, error: lockError } = await admin
          .from("internal_users")
          .update({ is_locked: true })
          .eq("email", email)
          .eq("is_locked", false)
          .select("id")
          .maybeSingle();
        if (lockError) throw new Error("Could not lock the account after repeated failures");
        if (lockedAccount) {
          await writeAudit(
            {
              actorUserId: lockedAccount.id,
              action: "ACCOUNT_LOCKED_FAILED_LOGIN",
              module: "Authentication",
              entityType: "internal_user",
              entityId: lockedAccount.id,
              reason: "Five failed sign-in attempts within 15 minutes",
              result: "FAILURE",
            },
            meta,
          );
        }
      }
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

/** One-time creation of the first Supervisor. Refuses once any internal user exists. */
export const bootstrapFirstSupervisor = createServerFn({ method: "POST" })
  .validator((input: unknown) => bootstrapInternalUserSchema.parse(input))
  .handler(async ({ data }) => {
    const { getAdmin, writeAudit, validationError, safeMessage } =
      await import("./server-core.server");
    const passwordCheck = validatePassword(data.password, [data.fullName, data.email]);
    if (!passwordCheck.valid)
      throw validationError(passwordCheck.errors[0] ?? "Password is invalid");
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
      const { data: employee, error: employeeError } = await admin.rpc(
        "ensure_internal_user_employee",
        { _user_id: userId },
      );
      if (employeeError || !employee) throw new Error("Could not create the employee record");
      const { error: roleError } = await admin
        .from("user_roles")
        .insert({ user_id: userId, role: "SUPERVISOR" });
      if (roleError) throw new Error(roleError.message);

      await writeAudit({
        actorUserId: userId,
        actorRole: "SUPERVISOR",
        action: "BOOTSTRAP_SUPERVISOR_CREATED",
        module: "Authentication",
        entityType: "internal_user",
        entityId: userId,
        newValue: { email: data.email, roles: ["SUPERVISOR"] },
      });
      return { ok: true, employeeNumber: employee.employee_number };
    } catch (error) {
      throw new Error(safeMessage(error, "Initial setup failed"));
    }
  });
