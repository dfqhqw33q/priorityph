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
  sourceEvaluationId: string;
  sourceCycleName: string | null;
  sourceCycleYear: number | null;
  recognitionType: z.infer<typeof recognitionType>;
  reason: string;
  recognitionDate: string;
  approvedAt: string;
  certificateGeneratedAt: string | null;
};

function related(row: Record<string, unknown>) {
  const employee = row["employees"] as { full_name?: string; employee_number?: string } | null;
  const evaluation = row["evaluations"] as {
    evaluation_cycles?: { name?: string; year?: number } | null;
  } | null;
  return {
    employeeId: String(row["employee_id"]),
    employeeName: employee?.full_name ?? "Unknown employee",
    employeeNumber: employee?.employee_number ?? "",
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
  .inputValidator((input: unknown) => filterSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { getAdmin, requirePermission } = await import("./server-core.server");
    await requirePermission(context.userId, "recognition.view", "Social Recognition");
    const admin = await getAdmin();
    let candidates = admin
      .from("recognition_candidates")
      .select(
        "*, employees!inner(full_name, employee_number), evaluations(evaluation_cycles(name, year))",
      )
      .order("created_at", { ascending: false });
    let records = admin
      .from("recognition_records")
      .select(
        "*, employees!inner(full_name, employee_number), evaluations(evaluation_cycles(name, year))",
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
    const { getAdmin, requirePermission } = await import("./server-core.server");
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
    const { getAdmin, requirePermission } = await import("./server-core.server");
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

export const reviewRecognitionCandidate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
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
      await import("./server-core.server");
    await requirePermission(context.userId, "recognition.manage", "Social Recognition");
    const admin = await getAdmin();
    const { data: candidate } = await admin
      .from("recognition_candidates")
      .select("*")
      .eq("id", data.id)
      .maybeSingle();
    if (!candidate) throw validationError("Recognition candidate not found");
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
        title: `Recognition candidate ${data.decision.toLowerCase()}`,
        body: "A recognition candidate review was completed.",
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
          title: "Recognition approved",
          body: "A recognition record was approved.",
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
  .inputValidator((input: unknown) =>
    z
      .object({
        employeeId: z.string().uuid(),
        sourceEvaluationId: z.string().uuid(),
        reason: z.string().trim().min(1).max(4000),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { getAdmin, requirePermission, validationError } = await import("./server-core.server");
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
        title: "Recognition candidate created",
        body: "A recognition candidate is ready for review.",
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
  .inputValidator((input: unknown) => z.object({ recordId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { getAdmin, requirePermission, validationError } = await import("./server-core.server");
    await requirePermission(context.userId, "recognition.manage", "Social Recognition");
    const admin = await getAdmin();
    const { data: row } = await admin
      .from("recognition_records")
      .select("*, employees(full_name), recognition_candidates(recognition_type, reason)")
      .eq("id", data.recordId)
      .maybeSingle();
    if (!row) throw validationError("Recognition record not found");
    const employee = row.employees as { full_name?: string } | null;
    const candidate = row.recognition_candidates as {
      recognition_type?: string;
      reason?: string;
    } | null;
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
    page.drawText(`Issued ${new Date(row.recognition_date).toLocaleDateString()}`, {
      x: 315,
      y: 170,
      size: 12,
      font,
    });
    const bytes = await pdf.save();
    await admin
      .from("recognition_records")
      .update({ certificate_generated_at: new Date().toISOString() })
      .eq("id", data.recordId);
    return {
      fileName: `Recognition_${(employee?.full_name ?? "Employee").replace(/[^a-z0-9]+/gi, "_")}.pdf`,
      base64: Buffer.from(bytes).toString("base64"),
    };
  });

export async function ensureRecognitionCandidatesForEvaluation(
  evaluationId: string,
): Promise<void> {
  const { getAdmin } = await import("./server-core.server");
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
        title: "Recognition candidate created",
        body: "A recognition candidate is ready for review.",
        dedupe_key: `${evaluation.id}:RECOGNITION_CANDIDATE:${candidate.key}`,
      } as never,
      { onConflict: "dedupe_key" },
    );
  }
}
