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
  .inputValidator((input: unknown) => z.object({ evaluationId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { getAdmin, requirePermissionAny, writeAudit, getActorRoles, validationError } = await import("./server-core.server");
    await requirePermissionAny(context.userId, ["evaluations.view_history", "president.view"], "Final Evaluation");
    const admin = await getAdmin();
    const { data: document } = await admin.from("employee_documents").select("id, storage_path, file_name").eq("evaluation_id", data.evaluationId).eq("category", "PERFORMANCE_EVALUATIONS").maybeSingle();
    if (!document) throw validationError("The finalized evaluation document is not available yet");
    const { data: signed, error } = await admin.storage.from("employee-files").createSignedUrl(document.storage_path, 300);
    if (error || !signed?.signedUrl) throw validationError(error?.message ?? "Could not create document link");
    await writeAudit({ actorUserId: context.userId, actorRole: (await getActorRoles(context.userId)).join(","), action: "DOCUMENT_VIEWED", module: "Employee Files", entityType: "employee_document", entityId: document.id, evaluationId: data.evaluationId });
    return { url: signed.signedUrl, fileName: document.file_name };
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
