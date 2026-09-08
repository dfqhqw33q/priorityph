import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const profileFields = z.object({
  notes: z.string().max(4000),
});

export type SuccessionProfile = {
  id: string;
  employeeId: string;
  employeeName: string;
  employeeNumber: string;
  sourceEvaluationId: string;
  sourceCycleName: string | null;
  sourceCycleYear: number | null;
  developmentPotential: string;
  advancementOutlook: string;
  careerInterest: string;
  transferInterest: string;
  desiredJob: string;
  desiredLocation: string;
  qualification: string;
  notes: string;
};

function mapProfile(row: Record<string, unknown>): SuccessionProfile {
  const employee = row["employees"] as { full_name?: string; employee_number?: string } | null;
  const evaluation = row["evaluations"] as {
    evaluation_cycles?: { name?: string; year?: number } | null;
  } | null;
  return {
    id: String(row["id"]),
    employeeId: String(row["employee_id"]),
    employeeName: employee?.full_name ?? "Unknown employee",
    employeeNumber: employee?.employee_number ?? "",
    sourceEvaluationId: String(row["source_evaluation_id"]),
    sourceCycleName: evaluation?.evaluation_cycles?.name ?? null,
    sourceCycleYear: evaluation?.evaluation_cycles?.year ?? null,
    developmentPotential: String(row["development_potential"] ?? ""),
    advancementOutlook: String(row["advancement_outlook"] ?? ""),
    careerInterest: String(row["career_interest"] ?? ""),
    transferInterest: String(row["transfer_interest"] ?? ""),
    desiredJob: String(row["desired_job"] ?? ""),
    desiredLocation: String(row["desired_location"] ?? ""),
    qualification: String(row["qualification"] ?? ""),
    notes: String(row["notes"] ?? ""),
  };
}

export const listSuccessionProfiles = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        search: z.string().max(200).default(""),
        transferInterest: z.string().max(200).default(""),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { getAdmin, requirePermission } = await import("./server-core.server");
    await requirePermission(context.userId, "succession.view", "Succession Planning");
    const admin = await getAdmin();
    let query = admin
      .from("succession_profiles")
      .select(
        "*, employees!inner(full_name, employee_number), evaluations(evaluation_cycles(name, year))",
      )
      .order("updated_at", { ascending: false });
    if (data.search.trim()) {
      const term = data.search.trim();
      query = query.or(
        `development_potential.ilike.%${term}%,advancement_outlook.ilike.%${term}%,desired_job.ilike.%${term}%,desired_location.ilike.%${term}%,qualification.ilike.%${term}%`,
      );
    }
    if (data.transferInterest.trim())
      query = query.ilike("transfer_interest", `%${data.transferInterest.trim()}%`);
    const { data: rows, error } = await query;
    if (error) throw new Error(error.message);
    return (rows ?? []).map((row) => mapProfile(row as unknown as Record<string, unknown>));
  });

export const updateSuccessionProfile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => profileFields.extend({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { getAdmin, requirePermission, validationError, writeAudit, getActorRoles } =
      await import("./server-core.server");
    await requirePermission(context.userId, "succession.manage", "Succession Planning");
    const admin = await getAdmin();
    const { data: previous } = await admin
      .from("succession_profiles")
      .select("employee_id, notes")
      .eq("id", data.id)
      .maybeSingle();
    if (!previous) throw validationError("Succession profile not found");
    const { error } = await admin
      .from("succession_profiles")
      .update({ notes: data.notes })
      .eq("id", data.id);
    if (error) throw validationError(error.message);
    await writeAudit({
      actorUserId: context.userId,
      actorRole: (await getActorRoles(context.userId)).join(","),
      action: "SUCCESSION_PROFILE_UPDATED",
      module: "Succession Planning",
      entityType: "succession_profile",
      entityId: data.id,
      employeeId: previous.employee_id,
      previousValue: previous,
      newValue: data,
    });
    return { ok: true as const };
  });

export async function ensureSuccessionProfileForEvaluation(evaluationId: string): Promise<void> {
  const { getAdmin } = await import("./server-core.server");
  const admin = await getAdmin();
  const { data: raw } = await admin
    .from("evaluations")
    .select("*")
    .eq("id", evaluationId)
    .maybeSingle();
  const evaluation = raw as unknown as {
    id: string;
    employee_id: string;
    is_finalized: boolean;
    supervisor_step2_development_potential: string;
    supervisor_step2_advancement_outlook: string;
    supervisor_step2_transfer_interest: string;
    supervisor_step2_transfer_job: string;
    supervisor_step2_transfer_where: string;
    supervisor_step2_transfer_qualified: string;
  } | null;
  if (!evaluation?.is_finalized) return;
  const hasRelevantData = [
    evaluation.supervisor_step2_development_potential,
    evaluation.supervisor_step2_advancement_outlook,
    evaluation.supervisor_step2_transfer_interest,
    evaluation.supervisor_step2_transfer_job,
    evaluation.supervisor_step2_transfer_where,
    evaluation.supervisor_step2_transfer_qualified,
  ].some((value) => value?.trim());
  if (!hasRelevantData) return;
  const { error } = await admin.from("succession_profiles").upsert(
    {
      employee_id: evaluation.employee_id,
      source_evaluation_id: evaluation.id,
      development_potential: evaluation.supervisor_step2_development_potential ?? "",
      advancement_outlook: evaluation.supervisor_step2_advancement_outlook ?? "",
      career_interest: evaluation.supervisor_step2_transfer_interest ?? "",
      transfer_interest: evaluation.supervisor_step2_transfer_interest ?? "",
      desired_job: evaluation.supervisor_step2_transfer_job ?? "",
      desired_location: evaluation.supervisor_step2_transfer_where ?? "",
      qualification: evaluation.supervisor_step2_transfer_qualified ?? "",
    },
    { onConflict: "employee_id" },
  );
  if (error) throw new Error(error.message);
  await admin.from("notification_events").upsert(
    {
      evaluation_id: evaluation.id,
      event_type: "SUCCESSION_PROFILE_UPDATED",
      audience_permission: "succession.manage",
      title: "Career & Succession Update",
      body: "A Career & Succession profile has been updated from a finalized performance evaluation.",
      dedupe_key: `${evaluation.id}:SUCCESSION_PROFILE_UPDATED`,
    } as never,
    { onConflict: "dedupe_key" },
  );
}
