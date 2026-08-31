import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const idSchema = z.object({ employeeId: z.string().uuid() });
const uploadSchema = z.object({ employeeId: z.string().uuid(), fileName: z.string().trim().min(1).max(180), contentType: z.string().max(120), contentBase64: z.string().min(1).max(14_000_000), category: z.enum(["AWARDS_RECOGNITION", "TRAINING_CERTIFICATES", "SUPPORTING_DOCUMENTS", "OTHER_DOCUMENTS"] as const) });

export const listEmployeeDocuments = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => idSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { getAdmin, requirePermission, writeAudit, getActorRoles } = await import("./server-core.server");
    await requirePermission(context.userId, "employees.view", "Employee Files");
    const admin = await getAdmin();
    const { data: rows, error } = await admin.from("employee_documents").select("id, employee_id, evaluation_id, category, file_name, content_type, file_size, created_at").eq("employee_id", data.employeeId).order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    await writeAudit({ actorUserId: context.userId, actorRole: (await getActorRoles(context.userId)).join(","), action: "EMPLOYEE_FILE_VIEWED", module: "Employee Files", entityType: "employee", entityId: data.employeeId });
    return rows ?? [];
  });

export const getEmployeeDocumentUrl = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ documentId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { getAdmin, requirePermission, writeAudit, getActorRoles, validationError } = await import("./server-core.server");
    await requirePermission(context.userId, "employees.view", "Employee Files");
    const admin = await getAdmin();
    const { data: document } = await admin.from("employee_documents").select("employee_id, storage_path, file_name").eq("id", data.documentId).maybeSingle();
    if (!document) throw validationError("Document not found");
    const { data: signed, error } = await admin.storage.from("employee-files").createSignedUrl(document.storage_path, 300);
    if (error || !signed?.signedUrl) throw validationError(error?.message ?? "Could not create document link");
    await writeAudit({ actorUserId: context.userId, actorRole: (await getActorRoles(context.userId)).join(","), action: "DOCUMENT_DOWNLOADED", module: "Employee Files", entityType: "employee_document", entityId: data.documentId, newValue: { fileName: document.file_name } });
    return { url: signed.signedUrl, fileName: document.file_name };
  });

export const getEvaluationDocumentUrl = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ evaluationId: z.string().uuid(), forceRefresh: z.boolean().optional() }).parse(input))
  .handler(async ({ data, context }) => {
    const { getAdmin, requirePermissionAny, writeAudit, getActorRoles, validationError } = await import("./server-core.server");
    const { createFinalEvaluationDocument, ensureFinalizedEvaluationDocument } = await import("./documents.server");
    await requirePermissionAny(context.userId, ["evaluations.view_history", "president.view"], "Final Evaluation");
    const admin = await getAdmin();
    const { data: evaluation } = await admin
      .from("evaluations")
      .select("status, version, employee_id")
      .eq("id", data.evaluationId)
      .maybeSingle();
    let document: { id: string; storage_path: string; file_name: string } | null = null;
    const shouldForceRefresh = Boolean(data.forceRefresh);
    if (evaluation?.status === "FINALIZED") {
      try {
        document = await ensureFinalizedEvaluationDocument(data.evaluationId, context.userId, shouldForceRefresh);
      } catch {
        document = null;
      }
    }
    if (!document && !shouldForceRefresh) {
      const { data: existing } = await admin
        .from("employee_documents")
        .select("id, storage_path, file_name")
        .eq("evaluation_id", data.evaluationId)
        .eq("category", "PERFORMANCE_EVALUATIONS")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      document = existing ?? null;
    }
    if (!document && evaluation) {
      try {
        document = await createFinalEvaluationDocument(data.evaluationId, context.userId, {
          statusOverride: evaluation.status,
          finalizedAt: new Date().toISOString(),
          forceRefresh: shouldForceRefresh,
        });
      } catch (error) {
        if (!evaluation) throw validationError("Evaluation not found");
        throw new Error(
          error instanceof Error ? error.message : "Unable to generate a preview of the evaluation document.",
        );
      }
    }
    if (!document) {
      if (!evaluation) throw validationError("Evaluation not found");
      throw new Error("Unable to load the evaluation document. Please contact HR/System Administrator.");
    }
    const { data: signed, error } = await admin.storage.from("employee-files").createSignedUrl(document.storage_path, 300);
    if (error || !signed?.signedUrl) {
      if (evaluation?.status === "FINALIZED") {
        throw new Error("Unable to load the finalized evaluation document. Please contact HR/System Administrator.");
      }
      throw validationError(error?.message ?? "Could not create document link");
    }
    const cacheBustedUrl = new URL(signed.signedUrl);
    cacheBustedUrl.searchParams.set("t", String(Date.now()));
    await writeAudit({ actorUserId: context.userId, actorRole: (await getActorRoles(context.userId)).join(","), action: "DOCUMENT_VIEWED", module: "Employee Files", entityType: "employee_document", entityId: document.id, evaluationId: data.evaluationId });
    return { url: cacheBustedUrl.toString(), fileName: document.file_name };
  });

export const uploadEmployeeDocument = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => uploadSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { getAdmin, requirePermission, writeAudit, getActorRoles, validationError } = await import("./server-core.server");
    await requirePermission(context.userId, "employees.view", "Employee Files");
    const admin = await getAdmin();
    const bytes = Uint8Array.from(Buffer.from(data.contentBase64, "base64"));
    if (bytes.length > 10_000_000) throw validationError("Documents must be 10 MB or smaller");
    const safeName = data.fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
    const path = `employees/${data.employeeId}/documents/${crypto.randomUUID()}-${safeName}`;
    const { error: uploadError } = await admin.storage.from("employee-files").upload(path, bytes, { contentType: data.contentType || "application/octet-stream", upsert: false });
    if (uploadError) throw validationError(uploadError.message);
    const { data: document, error } = await admin.from("employee_documents").insert({ employee_id: data.employeeId, category: data.category, file_name: data.fileName, storage_path: path, content_type: data.contentType || "application/octet-stream", file_size: bytes.length, created_by: context.userId }).select().single();
    if (error) throw validationError(error.message);
    await writeAudit({ actorUserId: context.userId, actorRole: (await getActorRoles(context.userId)).join(","), action: "DOCUMENT_UPLOADED", module: "Employee Files", entityType: "employee_document", entityId: document.id, newValue: { category: data.category, fileName: data.fileName, fileSize: bytes.length } });
    return document;
  });

export const getEvaluationSheetHtml = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ evaluationId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { getAdmin, requirePermissionAny, validationError } = await import("./server-core.server");
    const { generateEvaluationData, generateEvaluationHTML } = await import("./documents.server");

    try {
      console.log(`[getEvaluationSheetHtml] Starting for evaluation: ${data.evaluationId}`);
      
      // Check both permissions to allow access at different workflow stages
      await requirePermissionAny(context.userId, ["evaluations.view_history", "president.view", "evaluations.review"], "Evaluation Sheet");
      console.log(`[getEvaluationSheetHtml] Permissions check passed`);

      const admin = await getAdmin();
      const { data: evaluation, error: evalError } = await admin
        .from("evaluations")
        .select("id, status, cycle_id")
        .eq("id", data.evaluationId)
        .maybeSingle();

      console.log(`[getEvaluationSheetHtml] Query result:`, { evaluation, evalError });

      if (evalError) throw validationError(`Database error fetching evaluation: ${evalError.message}`);
      if (!evaluation) throw validationError(`Evaluation not found with ID: ${data.evaluationId}`);

      console.log(`[getEvaluationSheetHtml] Evaluation found, generating data...`);
      
      // Generate the HTML on-demand - allow at any stage where user has permission
      const evaluationData = await generateEvaluationData(data.evaluationId);
      console.log(`[getEvaluationSheetHtml] Evaluation data generated`);
      
      const html = generateEvaluationHTML(evaluationData);
      console.log(`[getEvaluationSheetHtml] HTML generated, returning`);

      return { html };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      console.error(`[getEvaluationSheetHtml] Error occurred:`, errorMsg);
      
      if (error instanceof Error && error.message.includes("VALIDATION")) {
        throw error;
      }
      throw validationError(`Failed to generate evaluation sheet: ${errorMsg}`);
    }
  });

