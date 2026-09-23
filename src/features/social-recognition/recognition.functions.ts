import { createServerFn } from "@tanstack/react-start";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const recognitionType = z.enum([
  "Highest Rated Employee",
  "Most Improved Employee",
  "Outstanding Performance",
  "Other Recognition",
]);
const candidateStatus = z.enum(["PENDING", "APPROVED", "REJECTED"]);
const filterSchema = z.object({
  search: z.string().max(200).default(""),
  employeeId: z.string().uuid().nullable().default(null),
  recognitionType: recognitionType.nullable().default(null),
  status: candidateStatus.nullable().default(null),
});

export type RecognitionCandidate = {
  id: string;
  employeeId: string;
  employeeName: string;
  employeeNumber: string;
  employeeJobTitle: string;
  employeeDivision: string;
  employeeSection: string;
  sourceEvaluationId: string;
  sourceCycleName: string | null;
  sourceCycleYear: number | null;
  recognitionType: z.infer<typeof recognitionType>;
  reason: string;
  status: z.infer<typeof candidateStatus>;
  reviewNotes: string;
};

export type RecognitionRecord = {
  id: string;
  candidateId: string;
  employeeId: string;
  employeeName: string;
  employeeNumber: string;
  employeeJobTitle: string;
  employeeDivision: string;
  employeeSection: string;
  sourceEvaluationId: string;
  sourceCycleName: string | null;
  sourceCycleYear: number | null;
  recognitionType: z.infer<typeof recognitionType>;
  reason: string;
  recognitionDate: string;
  approvedAt: string;
  certificateGeneratedAt: string | null;
  status?: z.infer<typeof candidateStatus>;
};

export type RecognitionRankingRow = {
  rank: number;
  employeeId: string;
  employeeName: string;
  employeeJobTitle: string;
  employeeDivision: string;
  sourceEvaluationId: string;
  sourceCycleName: string | null;
  sourceCycleYear: number | null;
  performanceScore: number;
  recognitionStatus: "RECOGNIZED" | "PENDING" | "NOT_RECOGNIZED";
  recognitionRecordId: string | null;
  certificateGeneratedAt: string | null;
};

function related(row: Record<string, unknown>) {
  const employee = row["employees"] as {
    full_name?: string;
    employee_number?: string;
    job_title?: string;
    division?: string;
    section?: string;
  } | null;
  const evaluation = row["evaluations"] as {
    evaluation_cycles?: { name?: string; year?: number } | null;
  } | null;
  return {
    employeeId: String(row["employee_id"]),
    employeeName: employee?.full_name ?? "Unknown employee",
    employeeNumber: employee?.employee_number ?? "",
    employeeJobTitle: employee?.job_title ?? "",
    employeeDivision: employee?.division ?? "",
    employeeSection: employee?.section ?? "",
    sourceEvaluationId: String(row["source_evaluation_id"]),
    sourceCycleName: evaluation?.evaluation_cycles?.name ?? null,
    sourceCycleYear: evaluation?.evaluation_cycles?.year ?? null,
  };
}

function mapCandidate(row: Record<string, unknown>): RecognitionCandidate {
  return {
    id: String(row["id"]),
    ...related(row),
    recognitionType: row["recognition_type"] as RecognitionCandidate["recognitionType"],
    reason: String(row["reason"]),
    status: row["status"] as RecognitionCandidate["status"],
    reviewNotes: String(row["review_notes"] ?? ""),
  };
}

function mapRecord(row: Record<string, unknown>): RecognitionRecord {
  return {
    id: String(row["id"]),
    candidateId: String(row["candidate_id"]),
    ...related(row),
    recognitionType: row["recognition_type"] as RecognitionRecord["recognitionType"],
    reason: String(row["reason"]),
    recognitionDate: String(row["recognition_date"]),
    approvedAt: String(row["approved_at"]),
    certificateGeneratedAt: (row["certificate_generated_at"] as string | null) ?? null,
  };
}

export const listRecognitionData = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => filterSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { getAdmin, requirePermission } = await import("../../lib/server-core.server");
    await requirePermission(context.userId, "recognition.view", "Social Recognition");
    const admin = await getAdmin();
    let candidates = admin
      .from("recognition_candidates")
      .select(
        "id, employee_id, source_evaluation_id, recognition_type, reason, status, review_notes, created_at, employees!inner(full_name, employee_number, job_title, division, section), evaluations!inner(status, is_finalized, evaluation_cycles(name, year))",
      )
      .order("created_at", { ascending: false });
    let records = admin
      .from("recognition_records")
      .select(
        "id, candidate_id, employee_id, source_evaluation_id, recognition_type, reason, recognition_date, approved_at, certificate_generated_at, employees!inner(full_name, employee_number, job_title, division, section), evaluations!inner(status, is_finalized, evaluation_cycles(name, year))",
      )
      .order("recognition_date", { ascending: false });
    if (data.employeeId) {
      candidates = candidates.eq("employee_id", data.employeeId);
      records = records.eq("employee_id", data.employeeId);
    }
    if (data.recognitionType) {
      candidates = candidates.eq("recognition_type", data.recognitionType);
      records = records.eq("recognition_type", data.recognitionType);
    }
    if (data.status) candidates = candidates.eq("status", data.status);
    if (data.search.trim()) {
      const term = data.search.trim();
      candidates = candidates.or(`reason.ilike.%${term}%`);
      records = records.or(`reason.ilike.%${term}%`);
    }
    const [
      { data: candidateRows, error: candidateError },
      { data: recordRows, error: recordError },
    ] = await Promise.all([candidates, records]);
    if (candidateError) throw new Error(candidateError.message);
    if (recordError) throw new Error(recordError.message);
    return {
      candidates: (candidateRows ?? []).map((row) =>
        mapCandidate(row as unknown as Record<string, unknown>),
      ),
      records: (recordRows ?? []).map((row) =>
        mapRecord(row as unknown as Record<string, unknown>),
      ),
    };
  });

export const listRecognitionEmployees = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { getAdmin, requirePermission } = await import("../../lib/server-core.server");
    await requirePermission(context.userId, "recognition.view", "Social Recognition");
    const admin = await getAdmin();
    const { data, error } = await admin
      .from("employees")
      .select("id, full_name, employee_number")
      .order("full_name");
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const listFinalizedEvaluationsForRecognition = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { getAdmin, requirePermission } = await import("../../lib/server-core.server");
    await requirePermission(context.userId, "recognition.manage", "Social Recognition");
    const admin = await getAdmin();
    const { data, error } = await admin
      .from("evaluations")
      .select(
        "id, employee_id, full_name_snapshot, employee_number_snapshot, evaluation_cycles(name, year)",
      )
      .eq("status", "FINALIZED")
      .order("finalized_at", { ascending: false });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const listRecognitionRanking = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<RecognitionRankingRow[]> => {
    const { getAdmin, requirePermission } = await import("../../lib/server-core.server");
    await requirePermission(context.userId, "recognition.view", "Social Recognition");
    const admin = await getAdmin();
    const { data: evaluations, error } = await admin
      .from("evaluations")
      .select(
        "id, employee_id, full_name_snapshot, job_title_snapshot, division_snapshot, status, is_finalized, evaluation_cycles(name, year), evaluation_scores(final_score)",
      )
      .eq("status", "FINALIZED")
      .eq("is_finalized", true)
      .order("finalized_at", { ascending: false });
    if (error) throw new Error(error.message);
    const rows = (evaluations ?? [])
      .map((row) => {
        const scoreRow = Array.isArray(row.evaluation_scores)
          ? row.evaluation_scores[0]
          : row.evaluation_scores;
        const score = Number(scoreRow?.final_score);
        if (!Number.isFinite(score)) return null;
        const cycle = Array.isArray(row.evaluation_cycles)
          ? row.evaluation_cycles[0]
          : row.evaluation_cycles;
        return {
          evaluationId: row.id,
          employeeId: row.employee_id,
          employeeName: row.full_name_snapshot,
          employeeJobTitle: row.job_title_snapshot,
          employeeDivision: row.division_snapshot,
          sourceCycleName: cycle?.name ?? null,
          sourceCycleYear: cycle?.year ?? null,
          performanceScore: score,
        };
      })
      .filter((row): row is NonNullable<typeof row> => row !== null)
      .sort((left, right) => right.performanceScore - left.performanceScore);
    if (rows.length === 0) return [];
    const evaluationIds = rows.map((row) => row.evaluationId);
    const [{ data: records }, { data: candidates }] = await Promise.all([
      admin
        .from("recognition_records")
        .select("id, source_evaluation_id, certificate_generated_at")
        .in("source_evaluation_id", evaluationIds),
      admin
        .from("recognition_candidates")
        .select("source_evaluation_id, status")
        .in("source_evaluation_id", evaluationIds),
    ]);
    const recordByEvaluation = new Map(
      (records ?? []).map((record) => [record.source_evaluation_id, record]),
    );
    const candidateByEvaluation = new Map<string, string>();
    for (const candidate of candidates ?? []) {
      if (candidate.status === "APPROVED") candidateByEvaluation.set(candidate.source_evaluation_id, "APPROVED");
      else if (!candidateByEvaluation.has(candidate.source_evaluation_id)) candidateByEvaluation.set(candidate.source_evaluation_id, candidate.status);
    }
    return rows.map((row, index) => {
      const record = recordByEvaluation.get(row.evaluationId);
      const candidateStatus = candidateByEvaluation.get(row.evaluationId);
      return {
        rank: index + 1,
        employeeId: row.employeeId,
        employeeName: row.employeeName,
        employeeJobTitle: row.employeeJobTitle,
        employeeDivision: row.employeeDivision,
        sourceEvaluationId: row.evaluationId,
        sourceCycleName: row.sourceCycleName,
        sourceCycleYear: row.sourceCycleYear,
        performanceScore: row.performanceScore,
        recognitionStatus: record
          ? "RECOGNIZED"
          : candidateStatus
            ? "PENDING"
            : "NOT_RECOGNIZED",
        recognitionRecordId: record?.id ?? null,
        certificateGeneratedAt: record?.certificate_generated_at ?? null,
      };
    });
  });

export const reviewRecognitionCandidate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) =>
    z
      .object({
        id: z.string().uuid(),
        decision: z.enum(["APPROVED", "REJECTED"]),
        reviewNotes: z.string().max(4000).default(""),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { getAdmin, requirePermission, validationError, getActorRoles, writeAudit } =
      await import("../../lib/server-core.server");
    await requirePermission(context.userId, "recognition.manage", "Social Recognition");
    const admin = await getAdmin();
    const { data: candidate } = await admin
      .from("recognition_candidates")
      .select("*")
      .eq("id", data.id)
      .maybeSingle();
    if (!candidate) throw validationError("Recognition candidate not found");
    const { data: sourceEvaluation } = await admin
      .from("evaluations")
      .select("status, is_finalized")
      .eq("id", candidate.source_evaluation_id)
      .maybeSingle();
    if (!sourceEvaluation || sourceEvaluation.status !== "FINALIZED" || !sourceEvaluation.is_finalized)
      throw validationError("Only finalized evaluations can be recognized");
    if (candidate.status !== "PENDING")
      throw validationError("This recognition candidate has already been reviewed");
    const reviewedAt = new Date().toISOString();
    const { error } = await admin
      .from("recognition_candidates")
      .update({
        status: data.decision,
        reviewed_by: context.userId,
        reviewed_at: reviewedAt,
        review_notes: data.reviewNotes,
      })
      .eq("id", data.id);
    if (error) throw validationError(error.message);
    await admin.from("notification_events").upsert(
      {
        evaluation_id: candidate.source_evaluation_id,
        event_type: "RECOGNITION_CANDIDATE_REVIEWED",
        audience_permission: "recognition.manage",
        title: data.decision === "APPROVED" ? "Recognition Approved" : "Recognition Candidate",
        body:
          data.decision === "APPROVED"
            ? "An employee recognition has been approved successfully."
            : "An employee has been identified as a recognition candidate and is ready for review.",
        dedupe_key: `${candidate.id}:RECOGNITION_REVIEW:${data.decision}`,
      } as never,
      { onConflict: "dedupe_key" },
    );
    if (data.decision === "APPROVED") {
      const { error: recordError } = await admin.from("recognition_records").upsert(
        {
          candidate_id: candidate.id,
          employee_id: candidate.employee_id,
          source_evaluation_id: candidate.source_evaluation_id,
          recognition_type: candidate.recognition_type,
          reason: candidate.reason,
          approved_by: context.userId,
          approved_at: reviewedAt,
          status: "APPROVED",
        },
        { onConflict: "candidate_id" },
      );
      if (recordError) throw validationError(recordError.message);
      await admin.from("notification_events").upsert(
        {
          evaluation_id: candidate.source_evaluation_id,
          event_type: "RECOGNITION_APPROVED",
          audience_permission: "recognition.view",
          title: "Recognition Approved",
          body: "An employee recognition has been approved successfully.",
          dedupe_key: `${candidate.id}:RECOGNITION_APPROVED`,
        } as never,
        { onConflict: "dedupe_key" },
      );
    }
    await writeAudit({
      actorUserId: context.userId,
      actorRole: (await getActorRoles(context.userId)).join(","),
      action: `RECOGNITION_${data.decision}`,
      module: "Social Recognition",
      entityType: "recognition_candidate",
      entityId: data.id,
      employeeId: candidate.employee_id,
      evaluationId: candidate.source_evaluation_id,
      newValue: { decision: data.decision, reviewNotes: data.reviewNotes },
    });
    return { ok: true as const };
  });

export const createOtherRecognitionCandidate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) =>
    z
      .object({
        employeeId: z.string().uuid(),
        sourceEvaluationId: z.string().uuid(),
        reason: z.string().trim().min(1).max(4000),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { getAdmin, requirePermission, validationError } =
      await import("../../lib/server-core.server");
    await requirePermission(context.userId, "recognition.manage", "Social Recognition");
    const admin = await getAdmin();
    const { data: evaluation } = await admin
      .from("evaluations")
      .select("id, employee_id, status")
      .eq("id", data.sourceEvaluationId)
      .maybeSingle();
    if (
      !evaluation ||
      evaluation.employee_id !== data.employeeId ||
      evaluation.status !== "FINALIZED"
    )
      throw validationError("Select a finalized evaluation for this employee");
    const { error } = await admin.from("recognition_candidates").upsert(
      {
        employee_id: data.employeeId,
        source_evaluation_id: data.sourceEvaluationId,
        recognition_type: "Other Recognition",
        reason: data.reason,
        source_key: `other-${data.reason
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .slice(0, 80)}`,
        status: "PENDING",
      },
      { onConflict: "source_evaluation_id,source_key" },
    );
    if (error) throw validationError(error.message);
    await admin.from("notification_events").upsert(
      {
        event_type: "RECOGNITION_CANDIDATE_CREATED",
        audience_permission: "recognition.manage",
        title: "Recognition Candidate",
        body: "An employee has been identified as a recognition candidate and is ready for review.",
        dedupe_key: `${data.sourceEvaluationId}:OTHER_RECOGNITION:${data.reason
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .slice(0, 80)}`,
      } as never,
      { onConflict: "dedupe_key" },
    );
    return { ok: true as const };
  });

export const generateRecognitionCertificate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => z.object({ recordId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { getAdmin, requirePermission, validationError } =
      await import("../../lib/server-core.server");
    await requirePermission(context.userId, "recognition.manage", "Social Recognition");
    const admin = await getAdmin();
    const { data: row } = await admin
      .from("recognition_records")
      .select(
        "*, employees(full_name), recognition_candidates(recognition_type, reason), evaluations!inner(status, is_finalized, full_name_snapshot, evaluation_cycles(name, year), evaluation_scores(final_score))",
      )
      .eq("id", data.recordId)
      .maybeSingle();
    if (!row) throw validationError("Recognition record not found");
    const sourceEvaluation = row.evaluations as { status?: string; is_finalized?: boolean } | null;
    if (sourceEvaluation?.status !== "FINALIZED" || !sourceEvaluation.is_finalized)
      throw validationError("Certificates require a finalized evaluation");
    if (row.certificate_generated_at)
      throw validationError("A certificate has already been generated for this recognition record");
    const employee = row.employees as { full_name?: string } | null;
    const candidate = row.recognition_candidates as {
      recognition_type?: string;
      reason?: string;
    } | null;
    const evaluation = row.evaluations as {
      evaluation_cycles?: { name?: string; year?: number } | null;
      evaluation_scores?: { final_score?: number | null } | null;
    } | null;
    const cycle = evaluation?.evaluation_cycles;
    const score = evaluation?.evaluation_scores?.final_score;
    const { data: signatory } = await admin
      .from("internal_users")
      .select("full_name")
      .eq("id", context.userId)
      .maybeSingle();
    const pdf = await PDFDocument.create();
    const page = pdf.addPage([792, 612]);
    const font = await pdf.embedFont(StandardFonts.Helvetica);
    const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
    page.drawText("CERTIFICATE OF RECOGNITION", {
      x: 185,
      y: 450,
      size: 26,
      font: bold,
      color: rgb(0.03, 0.05, 0.24),
    });
    page.drawText("This certificate recognizes", { x: 285, y: 390, size: 16, font });
    page.drawText(employee?.full_name ?? "Employee", {
      x: 240,
      y: 345,
      size: 28,
      font: bold,
      color: rgb(0, 0, 0.8),
    });
    page.drawText(candidate?.recognition_type ?? "Social Recognition", {
      x: 260,
      y: 295,
      size: 18,
      font: bold,
    });
    page.drawText(candidate?.reason ?? "Outstanding contribution", {
      x: 150,
      y: 250,
      size: 13,
      font,
      maxWidth: 492,
    });
    page.drawText(
      `Performance score: ${score !== null && score !== undefined ? Number(score).toFixed(2) : "N/A"}`,
      { x: 285, y: 210, size: 12, font },
    );
    page.drawText(`Evaluation cycle: ${cycle?.name ?? "Finalized evaluation"} ${cycle?.year ?? ""}`.trim(), {
      x: 270,
      y: 190,
      size: 12,
      font,
    });
    page.drawText(`Issued ${new Date(row.recognition_date).toLocaleDateString()}`, {
      x: 315,
      y: 170,
      size: 12,
      font,
    });
    page.drawText(`Authorized signatory: ${signatory?.full_name ?? "Priority Handling Logistics"}`, {
      x: 245,
      y: 135,
      size: 12,
      font,
    });
    const bytes = await pdf.save();
    const employeeId = String(row.employee_id ?? "");
    if (!employeeId) throw validationError("Recognition record has no employee assigned");
    const fileName = `Recognition_${(employee?.full_name ?? "Employee").replace(/[^a-z0-9]+/gi, "_")}_${data.recordId}.pdf`;
    const storagePath = `employees/${employeeId}/documents/recognition-${data.recordId}.pdf`;
    const { error: uploadError } = await admin.storage
      .from("employee-files")
      .upload(storagePath, bytes, {
        contentType: "application/pdf",
        upsert: true,
      });
    if (uploadError) throw validationError(uploadError.message);
    const { data: existingDocument } = await admin
      .from("employee_documents")
      .select("id")
      .eq("storage_path", storagePath)
      .maybeSingle();
    if (existingDocument?.id) {
      await admin
        .from("employee_documents")
        .update({
          employee_id: employeeId,
          category: "AWARDS_RECOGNITION",
          file_name: fileName,
          content_type: "application/pdf",
          file_size: bytes.length,
          created_by: context.userId,
        })
        .eq("id", existingDocument.id);
    } else {
      const { error: documentError } = await admin.from("employee_documents").insert({
        employee_id: employeeId,
        evaluation_id: row.source_evaluation_id ?? null,
        category: "AWARDS_RECOGNITION",
        file_name: fileName,
        storage_path: storagePath,
        content_type: "application/pdf",
        file_size: bytes.length,
        created_by: context.userId,
      });
      if (documentError) {
        await admin.storage.from("employee-files").remove([storagePath]);
        throw validationError(documentError.message);
      }
    }
    await admin
      .from("recognition_records")
      .update({ certificate_generated_at: new Date().toISOString() })
      .eq("id", data.recordId);
    const { getActorRoles, writeAudit } = await import("../../lib/server-core.server");
    await writeAudit({
      actorUserId: context.userId,
      actorRole: (await getActorRoles(context.userId)).join(","),
      action: "RECOGNITION_CERTIFICATE_GENERATED",
      module: "Social Recognition",
      entityType: "recognition_record",
      entityId: data.recordId,
      employeeId,
      evaluationId: row.source_evaluation_id,
      newValue: { fileName, storagePath },
    });
    return {
      fileName,
      base64: Buffer.from(bytes).toString("base64"),
    };
  });

export async function ensureRecognitionCandidatesForEvaluation(
  evaluationId: string,
): Promise<void> {
  const { getAdmin } = await import("../../lib/server-core.server");
  const admin = await getAdmin();
  const { data: evaluation } = await admin
    .from("evaluations")
    .select("id, employee_id, full_name_snapshot, is_finalized")
    .eq("id", evaluationId)
    .maybeSingle();
  if (!evaluation?.is_finalized) return;
  const { data: score } = await admin
    .from("evaluation_scores")
    .select("final_score, final_rating_label")
    .eq("evaluation_id", evaluationId)
    .maybeSingle();
  if (score?.final_score === null || score?.final_score === undefined) return;
  const { data: previous } = await admin
    .from("evaluations")
    .select("id")
    .eq("employee_id", evaluation.employee_id)
    .eq("status", "FINALIZED")
    .neq("id", evaluationId)
    .order("finalized_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const previousScore = previous
    ? (
        await admin
          .from("evaluation_scores")
          .select("final_score")
          .eq("evaluation_id", previous.id)
          .maybeSingle()
      ).data?.final_score
    : null;
  const candidates = [
    ...(Number(score.final_score) >= 4.5
      ? [
          {
            key: "highest-rated",
            type: "Highest Rated Employee" as const,
            reason: `Finalized performance score: ${score.final_score}.`,
          },
        ]
      : []),
    ...(previousScore !== null && Number(score.final_score) - Number(previousScore) >= 0.5
      ? [
          {
            key: "most-improved",
            type: "Most Improved Employee" as const,
            reason: `Finalized score improved from ${previousScore} to ${score.final_score}.`,
          },
        ]
      : []),
    ...(Number(score.final_score) >= 4.0
      ? [
          {
            key: "outstanding-performance",
            type: "Outstanding Performance" as const,
            reason: `Finalized performance rating: ${score.final_rating_label ?? score.final_score}.`,
          },
        ]
      : []),
  ];
  for (const candidate of candidates) {
    const { error } = await admin.from("recognition_candidates").upsert(
      {
        employee_id: evaluation.employee_id,
        source_evaluation_id: evaluation.id,
        recognition_type: candidate.type,
        reason: candidate.reason,
        source_key: candidate.key,
        status: "PENDING",
      },
      { onConflict: "source_evaluation_id,source_key" },
    );
    if (error) throw new Error(error.message);
    await admin.from("notification_events").upsert(
      {
        evaluation_id: evaluation.id,
        event_type: "RECOGNITION_CANDIDATE_CREATED",
        audience_permission: "recognition.manage",
        title: "Recognition Candidate",
        body: "An employee has been identified as a recognition candidate and is ready for review.",
        dedupe_key: `${evaluation.id}:RECOGNITION_CANDIDATE:${candidate.key}`,
      } as never,
      { onConflict: "dedupe_key" },
    );
  }
}
