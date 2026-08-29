import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { presidentRatingSaveSchema, presidentStepSaveSchema } from "./schemas";
import type { PresidentStepData } from "./domain";

export const getPresidentStats = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { requirePermission, presidentStats, recentActivity } = await import(
      "./server-core.server"
    );
    await requirePermission(context.userId, "president.view", "President Review");
    const [stats, activity] = await Promise.all([
      presidentStats(),
      recentActivity(["President Review"]),
    ]);
    return { ...stats, activity };
  });

export const getPresidentSteps = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ evaluationId: z.string().uuid() }).parse(input))
  .handler(
    async ({
      data,
      context,
    }): Promise<{ step2: PresidentStepData | null; step3: PresidentStepData | null }> => {
      const { requirePermission, loadPresidentStep } = await import("./server-core.server");
      await requirePermission(context.userId, "president.view", "President Review");
      const [step2, step3] = await Promise.all([
        loadPresidentStep(data.evaluationId, 2),
        loadPresidentStep(data.evaluationId, 3),
      ]);
      return {
        step2: (step2 as PresidentStepData | null) ?? null,
        step3: (step3 as PresidentStepData | null) ?? null,
      };
    },
  );

export const savePresidentRatings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => presidentRatingSaveSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { getAdmin, requirePermission, writeAudit, getActorRoles, validationError, assertVersion, upsertPresidentRatings } =
      await import("./server-core.server");
    const { computeScore, persistScore } = await import("./scoring.server");
    await requirePermission(context.userId, "president.view", "President Review");
    const evaluation = await assertVersion(data.evaluationId, data.version);
    if (evaluation.is_finalized || evaluation.status === "PRESIDENT_SUBMITTED")
      throw validationError("This evaluation can no longer be edited");
    await upsertPresidentRatings(data.evaluationId, data.ratings, context.userId);
    const admin = await getAdmin();
    const { error } = await admin
      .from("evaluations")
      .update({ president_user_id: context.userId })
      .eq("id", data.evaluationId)
      .eq("version", data.version);
    if (error) throw validationError(error.message);
    const score = await computeScore(data.evaluationId);
    await persistScore(data.evaluationId, score, context.userId);
    await writeAudit({
      actorUserId: context.userId,
      actorRole: (await getActorRoles(context.userId)).join(","),
      action: "PRESIDENT_RATINGS_UPDATED",
      module: "President Review",
      entityType: "evaluation",
      entityId: data.evaluationId,
      evaluationId: data.evaluationId,
      newValue: { ratings: data.ratings.length },
    });
    await writeAudit({
      actorUserId: context.userId,
      actorRole: (await getActorRoles(context.userId)).join(","),
      action: "SCORE_CALCULATED",
      module: "Scoring",
      entityType: "evaluation",
      entityId: data.evaluationId,
      evaluationId: data.evaluationId,
      newValue: { finalScore: score.finalScore, finalRating: score.finalRatingLabel, status: score.status },
    });
    return { ok: true };
  });

/**
 * Saves a President step as draft, or submits it. Submission validates every
 * required item server-side and locks the responses. Employee and Supervisor
 * data is never touched.
 */
export const savePresidentStepAnswers = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => presidentStepSaveSchema.parse(input))
  .handler(async ({ data, context }) => {
    const {
      getAdmin,
      requirePermission,
      writeAudit,
      getActorRoles,
      validationError,
      assertVersion,
      savePresidentStep,
      safeMessage,
    } = await import("./server-core.server");

    await requirePermission(
      context.userId,
      data.step === 2 ? "president.step2" : "president.step3",
      "President Review",
    );

    try {
      const admin = await getAdmin();
      const evaluation = await assertVersion(data.evaluationId, data.version);
      if (
        evaluation.status !== "PRESIDENT_REVIEW" &&
        evaluation.status !== "PRESIDENT_SUBMITTED"
      )
        throw validationError("This evaluation is not available for President review yet");
      if (evaluation.status === "PRESIDENT_SUBMITTED")
        throw validationError("The President assessment has already been submitted");

      if (data.step === 3) {
        const { data: row } = await admin
          .from("evaluations")
          .select("president_step2_submitted_at")
          .eq("id", data.evaluationId)
          .maybeSingle();
        if (data.submit && !row?.president_step2_submitted_at)
          throw validationError("Submit Step 2 before submitting Step 3");
      }

      await savePresidentStep(
        data.evaluationId,
        data.step,
        data.answers,
        context.userId,
        data.submit,
      );

      const patch: {
        status?: "PRESIDENT_REVIEW" | "PRESIDENT_SUBMITTED";
        president_user_id: string;
        president_step2_submitted_at?: string;
        president_step3_submitted_at?: string;
      } = { president_user_id: context.userId };

      const now = new Date().toISOString();
      if (data.submit && data.step === 2) patch.president_step2_submitted_at = now;
      if (data.submit && data.step === 3) {
        patch.president_step3_submitted_at = now;
        patch.status = "PRESIDENT_SUBMITTED";
      }

      const { error } = await admin
        .from("evaluations")
        .update(patch)
        .eq("id", data.evaluationId)
        .eq("version", data.version);
      if (error) throw validationError(error.message);

      if (data.submit && data.step === 3) {
        const { computeScore, persistScore } = await import("./scoring.server");
        const score = await computeScore(data.evaluationId);
        await persistScore(data.evaluationId, score, context.userId);
        if (score.status === "CALCULATED" && score.finalRatingLabel) {
          await admin.from("evaluations").update({ status: "READY_FOR_FINALIZATION" }).eq("id", data.evaluationId);
        }
      }

      if (data.submit) {
        await admin.from("evaluation_events").insert({
          evaluation_id: data.evaluationId,
          event_type: `PRESIDENT_STEP${data.step}_SUBMITTED`,
          from_status: evaluation.status,
          to_status: patch.status ?? evaluation.status,
          actor_user_id: context.userId,
        });
      }

      await writeAudit({
        actorUserId: context.userId,
        actorRole: (await getActorRoles(context.userId)).join(","),
        action: data.submit
          ? `PRESIDENT_STEP${data.step}_SUBMITTED`
          : `PRESIDENT_STEP${data.step}_DRAFT_SAVED`,
        module: "President Review",
        entityType: "evaluation",
        entityId: data.evaluationId,
        evaluationId: data.evaluationId,
        previousValue: { status: evaluation.status },
        newValue: { status: patch.status ?? evaluation.status, answers: data.answers.length },
      });

      return { ok: true, submitted: data.submit };
    } catch (error) {
      throw new Error(safeMessage(error, "Could not save the President assessment"));
    }
  });
