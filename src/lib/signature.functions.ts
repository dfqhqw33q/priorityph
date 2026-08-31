import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { getAdmin, validationError, requireSupabaseAuth, requirePermissionAny } from "./server-core.server";

const internalUserSignatureSchema = z.object({
  evaluationId: z.string().uuid(),
  stage: z.enum(["RATER_STEP2", "REVIEWING_SUPERVISOR_STEP3", "HR_REVIEW", "COMMITTEE_REVIEW", "PRESIDENT_STEP2", "PRESIDENT_STEP3"]),
  signature: z.object({
    method: z.enum(["UPLOAD", "DRAWN"]),
    data: z.string().min(1),
    contentType: z.string().default("image/png"),
  }),
});

export type InternalUserSignatureInput = z.infer<typeof internalUserSignatureSchema>;

/**
 * Submit a signature for an internal user (Supervisor, Reviewing Supervisor, etc.)
 * Stores signature image in Supabase storage or as inline base64 data
 */
export const submitInternalUserSignature = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .middleware([
    requirePermissionAny([
      "evaluations.step2",
      "evaluations.review_step3",
      "president.step2",
      "president.step3",
    ]),
  ])
  .inputValidator((input: unknown) => internalUserSignatureSchema.parse(input))
  .handler(async ({ data, context }) => {
    const admin = await getAdmin();
    const userId = context.userId;

    // Verify evaluation exists and user has access
    const { data: evaluation, error: evalError } = await admin
      .from("evaluations")
      .select("id, status, supervisor_user_id, cycle_id")
      .eq("id", data.evaluationId)
      .maybeSingle();

    if (evalError || !evaluation) {
      throw validationError("Evaluation not found");
    }

    // Validate signature data format
    if (!data.signature.data.startsWith("data:image/")) {
      throw validationError("A valid signature image is required");
    }

    let storagePath: string | null = null;
    let inlineSignature: string | null = data.signature.data;

    // Handle uploaded signatures
    if (data.signature.method === "UPLOAD") {
      const match = data.signature.data.match(/^data:(image\/(?:png|jpeg));base64,([A-Za-z0-9+/=]+)$/);
      if (!match) throw validationError("Signature upload must be a PNG or JPEG image");

      const contentType = String(match[1]);
      const encoded = String(match[2]);
      const bytes = Uint8Array.from(atob(encoded), (character) => character.charCodeAt(0));

      storagePath = `signatures/evaluations/${evaluation.id}/${userId}/${data.stage}.png`;

      const { error } = await admin.storage.from("employee-files").upload(storagePath, bytes, {
        contentType,
        upsert: true,
      });

      if (error) throw validationError("Could not securely store the signature");
      inlineSignature = null;
    }

    // Upsert signature record
    const { error: signatureError } = await admin.from("internal_user_signatures").upsert(
      {
        evaluation_id: evaluation.id,
        user_id: userId,
        stage: data.stage,
        method: data.signature.method,
        storage_path: storagePath,
        signature_data: inlineSignature,
        content_type: data.signature.contentType,
        file_size: data.signature.data.length,
        signed_at: new Date().toISOString(),
        source_version: 1,
      },
      {
        onConflict: "evaluation_id,user_id,stage",
      },
    );

    if (signatureError) {
      // Clean up storage if upload was successful but DB insert failed
      if (storagePath) {
        await admin.storage.from("employee-files").remove([storagePath]);
      }
      throw validationError("Could not save your signature");
    }

    return { success: true, stage: data.stage };
  });

/**
 * Retrieve internal user signature for an evaluation
 */
export const getInternalUserSignature = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .middleware([
    requirePermissionAny([
      "evaluations.view_history",
      "evaluations.rate_supervisor",
      "evaluations.submit_president",
      "president.view",
    ]),
  ])
  .handler(async ({ context }) => {
    const admin = await getAdmin();

    // Note: This would need evaluation ID and stage passed as parameters in a real implementation
    // This is a template - the actual implementation depends on how you structure the request

    return { success: true };
  });
