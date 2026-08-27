import { createServerFn } from "@tanstack/react-start";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { cycleFormSchema, cycleStatusActionSchema, reasonSchema } from "./schemas";
import type { CycleSummary, CycleStatus } from "./domain";
import { z } from "zod";

export const listTemplates = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { getAdmin, requirePermission } = await import("./server-core.server");
    await requirePermission(context.userId, "cycles.view", "Evaluation Cycles");
    const admin = await getAdmin();
    const { data } = await admin
      .from("evaluation_templates")
      .select("id, name, description, is_active")
      .eq("is_active", true)
      .order("name");
    return data ?? [];
  });

export const listCycles = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<CycleSummary[]> => {
    const { getAdmin, requirePermission, cycleCounts } = await import("./server-core.server");
    await requirePermission(context.userId, "cycles.view", "Evaluation Cycles");
    const admin = await getAdmin();
    const { data } = await admin
      .from("evaluation_cycles")
      .select("*")
      .order("year", { ascending: false })
      .order("created_at", { ascending: false });
    const rows = data ?? [];
    return Promise.all(
      rows.map(async (row) => ({ ...(row as never as CycleSummary), ...(await cycleCounts(row.id)) })),
    );
  });

export const getCycle = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ cycleId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }): Promise<CycleSummary | null> => {
    const { getAdmin, requirePermission, cycleCounts } = await import("./server-core.server");
    await requirePermission(context.userId, "cycles.view", "Evaluation Cycles");
    const admin = await getAdmin();
    const { data: row } = await admin
      .from("evaluation_cycles")
      .select("*")
      .eq("id", data.cycleId)
      .maybeSingle();
    if (!row) return null;
    return { ...(row as never as CycleSummary), ...(await cycleCounts(row.id)) };
  });

export const saveCycle = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    cycleFormSchema
      .and(z.object({ cycleId: z.string().uuid().optional() }))
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { getAdmin, requirePermission, writeAudit, getActorRoles, validationError } =
      await import("./server-core.server");
    await requirePermission(context.userId, "cycles.manage", "Evaluation Cycles");
    const admin = await getAdmin();
    const roles = await getActorRoles(context.userId);

    const payload = {
      name: data.name,
      year: data.year,
      template_id: data.templateId,
      instructions: data.instructions ?? "",
      starts_at: new Date(data.startsAt).toISOString(),
      ends_at: new Date(data.endsAt).toISOString(),
    };

    if (data.cycleId) {
      const { data: existing } = await admin
        .from("evaluation_cycles")
        .select("*")
        .eq("id", data.cycleId)
        .maybeSingle();
      if (!existing) throw validationError("Cycle not found");
      if (existing.status !== "DRAFT")
        throw validationError("Only draft cycles can be edited");
      const { error } = await admin.from("evaluation_cycles").update(payload).eq("id", data.cycleId);
      if (error) throw validationError(error.message);
      await writeAudit({
        actorUserId: context.userId,
        actorRole: roles.join(","),
        action: "CYCLE_UPDATED",
        module: "Evaluation Cycles",
        entityType: "evaluation_cycle",
        entityId: data.cycleId,
        previousValue: existing,
        newValue: payload,
      });
      return { cycleId: data.cycleId };
    }

    const { data: created, error } = await admin
      .from("evaluation_cycles")
      .insert({ ...payload, created_by: context.userId })
      .select("id")
      .single();
    if (error || !created) throw validationError(error?.message ?? "Could not create the cycle");
    await writeAudit({
      actorUserId: context.userId,
      actorRole: roles.join(","),
      action: "CYCLE_CREATED",
      module: "Evaluation Cycles",
      entityType: "evaluation_cycle",
      entityId: created.id,
      newValue: payload,
    });
    return { cycleId: created.id };
  });

export const changeCycleStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => cycleStatusActionSchema.parse(input))
  .handler(async ({ data, context }) => {
    const {
      getAdmin,
      requirePermission,
      writeAudit,
      getActorRoles,
      validationError,
      generateCycleToken,
    } = await import("./server-core.server");
    await requirePermission(context.userId, "cycles.manage", "Evaluation Cycles");
    const admin = await getAdmin();
    const roles = await getActorRoles(context.userId);

    const { data: existing } = await admin
      .from("evaluation_cycles")
      .select("*")
      .eq("id", data.cycleId)
      .maybeSingle();
    if (!existing) throw validationError("Cycle not found");

    const next = data.status as CycleStatus;
    const allowed: Record<CycleStatus, CycleStatus[]> = {
      DRAFT: ["ACTIVE", "DISABLED"],
      ACTIVE: ["CLOSED", "DISABLED"],
      CLOSED: ["DISABLED"],
      DISABLED: [],
    };
    if (!allowed[existing.status as CycleStatus].includes(next))
      throw validationError(`A ${existing.status.toLowerCase()} cycle cannot become ${next.toLowerCase()}`);

    const patch: {
      status: CycleStatus;
      cycle_token?: string;
      token_generated_at?: string;
      activated_at?: string;
      closed_at?: string;
    } = { status: next };
    if (next === "ACTIVE") {
      if (!existing.cycle_token) {
        patch.cycle_token = generateCycleToken();
        patch.token_generated_at = new Date().toISOString();
      }
      patch.activated_at = new Date().toISOString();
    }
    if (next === "CLOSED") patch.closed_at = new Date().toISOString();

    const { error } = await admin.from("evaluation_cycles").update(patch).eq("id", data.cycleId);
    if (error) throw validationError(error.message);

    await writeAudit({
      actorUserId: context.userId,
      actorRole: roles.join(","),
      action: `CYCLE_${next}`,
      module: "Evaluation Cycles",
      entityType: "evaluation_cycle",
      entityId: data.cycleId,
      previousValue: { status: existing.status },
      newValue: { status: next },
      reason: data.reason,
    });
    return { ok: true };
  });

export const regenerateCycleToken = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ cycleId: z.string().uuid(), reason: reasonSchema }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { getAdmin, requirePermission, writeAudit, getActorRoles, validationError, generateCycleToken } =
      await import("./server-core.server");
    await requirePermission(context.userId, "cycles.manage_link", "Evaluation Cycles");
    const admin = await getAdmin();
    const roles = await getActorRoles(context.userId);

    const { data: existing } = await admin
      .from("evaluation_cycles")
      .select("id, status")
      .eq("id", data.cycleId)
      .maybeSingle();
    if (!existing) throw validationError("Cycle not found");
    if (existing.status !== "ACTIVE") throw validationError("Only active cycles have a shared link");

    const { error } = await admin
      .from("evaluation_cycles")
      .update({ cycle_token: generateCycleToken(), token_generated_at: new Date().toISOString() })
      .eq("id", data.cycleId);
    if (error) throw validationError(error.message);

    await writeAudit({
      actorUserId: context.userId,
      actorRole: roles.join(","),
      action: "CYCLE_LINK_REGENERATED",
      module: "Evaluation Cycles",
      entityType: "evaluation_cycle",
      entityId: data.cycleId,
      reason: data.reason,
    });
    return { ok: true };
  });

export const deleteDraftCycle = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ cycleId: z.string().uuid(), reason: reasonSchema }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { getAdmin, requirePermission, writeAudit, getActorRoles, validationError } =
      await import("./server-core.server");
    await requirePermission(context.userId, "cycles.manage", "Evaluation Cycles");
    const admin = await getAdmin();
    const roles = await getActorRoles(context.userId);
    const { data: existing } = await admin
      .from("evaluation_cycles")
      .select("*")
      .eq("id", data.cycleId)
      .maybeSingle();
    if (!existing) throw validationError("Cycle not found");
    if (existing.status !== "DRAFT") throw validationError("Only draft cycles can be deleted");
    const { error } = await admin.from("evaluation_cycles").delete().eq("id", data.cycleId);
    if (error) throw validationError(error.message);
    await writeAudit({
      actorUserId: context.userId,
      actorRole: roles.join(","),
      action: "CYCLE_DELETED",
      module: "Evaluation Cycles",
      entityType: "evaluation_cycle",
      entityId: data.cycleId,
      previousValue: existing,
      reason: data.reason,
    });
    return { ok: true };
  });
