import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

import { getAdmin, validationError } from "./server-core.server";

export type EmployeeDocumentCategory =
  | "PERFORMANCE_EVALUATIONS"
  | "AWARDS_RECOGNITION"
  | "TRAINING_CERTIFICATES"
  | "SUPPORTING_DOCUMENTS"
  | "OTHER_DOCUMENTS";

function formatDate(value: string | null | undefined) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("en-US", { year: "numeric", month: "2-digit", day: "2-digit" });
}

function formatFormDate(value: string | null | undefined) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
}

function normalizeText(value: unknown) {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

function wrapText(text: string, maxCharsPerLine: number) {
  const stripped = text.replace(/\r\n/g, "\n").trim();
  if (!stripped) return ["—"];

  const lines: string[] = [];
  for (const paragraph of stripped.split(/\n+/)) {
    const words = paragraph.split(/\s+/).filter(Boolean);
    if (words.length === 0) {
      lines.push("");
      continue;
    }

    let line = "";
    for (const word of words) {
      const candidate = line ? `${line} ${word}` : word;
      if (candidate.length <= maxCharsPerLine) {
        line = candidate;
      } else {
        if (line) lines.push(line);
        line = word;
      }
    }
    if (line) lines.push(line);
  }
  return lines.length > 0 ? lines : ["—"];
}

async function loadSignatureImage(
  pdf: PDFDocument,
  admin: Awaited<ReturnType<typeof getAdmin>>,
  entry: {
    method: string;
    signature_data: string | null;
    storage_path: string | null;
    content_type?: string | null;
  } | null,
) {
  if (!entry) return null;
  try {
    let bytes: Uint8Array | null = null;
    if (entry.method === "UPLOAD" && entry.storage_path) {
      const { data: blob, error } = await admin.storage.from("employee-files").download(entry.storage_path);
      if (error || !blob) return null;
      bytes = new Uint8Array(await blob.arrayBuffer());
    } else if (entry.signature_data) {
      const raw = entry.signature_data.includes(",") ? entry.signature_data.split(",")[1] : entry.signature_data;
      bytes = Uint8Array.from(atob(raw), (character) => character.charCodeAt(0));
    }
    if (!bytes) return null;
    try {
      return entry.method === "UPLOAD" && entry.content_type === "image/jpeg" ? await pdf.embedJpg(bytes) : await pdf.embedPng(bytes);
    } catch {
      return null;
    }
  } catch {
    return null;
  }
}

export type FinalDocumentGenerationOptions = {
  statusOverride?: string;
  finalizedAt?: string | null;
  finalizationReason?: string | null;
};

export async function ensureFinalizedEvaluationDocument(evaluationId: string, actorUserId: string) {
  const admin = await getAdmin();
  const { data: evaluation } = await admin
    .from("evaluations")
    .select("id, status, version, employee_id")
    .eq("id", evaluationId)
    .maybeSingle();
  if (!evaluation) throw new Error("Evaluation not found");
  if (evaluation.status !== "FINALIZED") {
    throw new Error("Finalized evaluation document is unavailable because the evaluation is not finalized.");
  }
  const { data: existing } = await admin
    .from("employee_documents")
    .select("id, storage_path, file_name, evaluation_version")
    .eq("evaluation_id", evaluationId)
    .eq("category", "PERFORMANCE_EVALUATIONS")
    .maybeSingle();
  if (existing && (existing.evaluation_version ?? evaluation.version) === evaluation.version) {
    return existing;
  }
  return createFinalEvaluationDocument(evaluationId, actorUserId, {
    statusOverride: "FINALIZED",
    finalizedAt: new Date().toISOString(),
  });
}

export async function createFinalEvaluationDocument(
  evaluationId: string,
  userId: string,
  options: FinalDocumentGenerationOptions = {},
) {
  const admin = await getAdmin();

  const { data: evaluation } = await admin
    .from("evaluations")
    .select(
      "id, version, employee_id, employee_number_snapshot, full_name_snapshot, job_title_snapshot, division_snapshot, section_snapshot, status, finalized_at, finalized_by, finalization_reason, supervisor_user_id, supervisor_submitted_at, supervisor_step2_strengths, supervisor_step2_weaknesses, supervisor_step2_development, supervisor_step2_advancement, supervisor_step2_career_transfer, supervisor_step2_recommendations, supervisor_step2_overall_explanation, supervisor_step2_effectiveness, supervisor_step2_development_potential, supervisor_step2_advancement_outlook, supervisor_step2_growth_suggestions, supervisor_step2_transfer_interest, supervisor_step2_transfer_job, supervisor_step2_transfer_where, supervisor_step2_transfer_qualified, supervisor_step2_other_comments, supervisor_step2_date, supervisor_remarks, cycle_id, evaluation_cycles(name, year, starts_at, ends_at, template_id)",
    )
    .eq("id", evaluationId)
    .maybeSingle();
  if (!evaluation) throw new Error("Evaluation not found");

  const cycle = (evaluation as never as { evaluation_cycles: { name: string; year: number; starts_at: string; ends_at: string; template_id: string } }).evaluation_cycles;
  const statusLabel = options.statusOverride ?? evaluation.status ?? "FINALIZED";
  const finalizedAt = options.finalizedAt ?? evaluation.finalized_at ?? new Date().toISOString();
  const finalizationReason = options.finalizationReason ?? evaluation.finalization_reason ?? null;

  const existingDocument = await admin
    .from("employee_documents")
    .select("id, storage_path, file_name, evaluation_version")
    .eq("evaluation_id", evaluationId)
    .eq("category", "PERFORMANCE_EVALUATIONS")
    .maybeSingle();
  if (existingDocument.data && (existingDocument.data.evaluation_version ?? evaluation.version) === evaluation.version) {
    return existingDocument.data;
  }

  const [criteriaResult, ratingsResult, scoreResult, employeeSignatureResult, stageSignatureResult, step2Result, step3Result, personnelResult, committeeResult, employeeRecordResult] = await Promise.all([
    admin.from("evaluation_criteria").select("id, letter, title, description, position").eq("template_id", cycle.template_id).order("position"),
    admin.from("evaluation_ratings").select("criterion_id, evaluator_type, rating").eq("evaluation_id", evaluationId),
    admin.from("evaluation_scores").select("final_score, final_rating_label, president_average, rule_version").eq("evaluation_id", evaluationId).maybeSingle(),
    admin.from("employee_signatures").select("method, storage_path, signature_data, content_type, signed_at").eq("evaluation_id", evaluationId).maybeSingle(),
    admin.from("evaluation_stage_signatures").select("stage, method, storage_path, signature_data, signed_at, content_type").eq("evaluation_id", evaluationId),
    admin.from("evaluations").select("supervisor_step2_strengths, supervisor_step2_weaknesses, supervisor_step2_development, supervisor_step2_advancement, supervisor_step2_career_transfer, supervisor_step2_recommendations, supervisor_step2_overall_explanation, supervisor_step2_effectiveness, supervisor_step2_development_potential, supervisor_step2_advancement_outlook, supervisor_step2_growth_suggestions, supervisor_step2_transfer_interest, supervisor_step2_transfer_job, supervisor_step2_transfer_where, supervisor_step2_transfer_qualified, supervisor_step2_other_comments, supervisor_step2_date, supervisor_remarks").eq("id", evaluationId).maybeSingle(),
    admin.from("reviewing_supervisor_reviews").select("comments, recommendations, reviewing_supervisor_date, reviewer_user_id").eq("evaluation_id", evaluationId).maybeSingle(),
    admin.from("personnel_processing").select("present_salary, last_increase_date, last_increase_nature, last_increase_amount, total_points, adjective_rating, recommended_increase_bonus, personnel_user_id").eq("evaluation_id", evaluationId).maybeSingle(),
    admin.from("committee_reviews").select("final_action, action_details, recommendation, committee_user_id").eq("evaluation_id", evaluationId).maybeSingle(),
    evaluation.employee_id ? admin.from("employees").select("full_name, job_title").eq("id", evaluation.employee_id).maybeSingle() : Promise.resolve({ data: null }),
  ]);

  const stageSignatures = new Map((stageSignatureResult.data ?? []).map((row) => [row.stage, row]));

  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const page = pdf.addPage([612, 792]);

  const employeeSignature = employeeSignatureResult?.data ?? null;
  const employeeSig = employeeSignature ? await loadSignatureImage(pdf, admin, employeeSignature) : null;
  const raterSig = stageSignatures.get("RATER_STEP2") ? await loadSignatureImage(pdf, admin, stageSignatures.get("RATER_STEP2") as never) : null;
  const reviewingSupervisorSig = stageSignatures.get("REVIEWING_SUPERVISOR_STEP3") ? await loadSignatureImage(pdf, admin, stageSignatures.get("REVIEWING_SUPERVISOR_STEP3") as never) : null;

  const userIds = [
    evaluation.supervisor_user_id,
    step3Result?.data?.reviewer_user_id,
    personnelResult?.data?.personnel_user_id,
    committeeResult?.data?.committee_user_id,
    evaluation.finalized_by,
  ].filter((value): value is string => Boolean(value));

  const { data: userListResult } = userIds.length
    ? await admin.from("internal_users").select("id, full_name, job_title").in("id", userIds)
    : { data: [] };

  const criteria = criteriaResult.data ?? [];
  const ratings = ratingsResult.data ?? [];
  const ratingMap = new Map<string, Record<string, number | undefined>>();
  for (const row of ratings) {
    const criterionKey = row.criterion_id;
    if (!ratingMap.has(criterionKey)) ratingMap.set(criterionKey, {});
    const item = ratingMap.get(criterionKey)!;
    item[row.evaluator_type] = row.rating;
  }

  const userLookup = new Map((userListResult.data ?? []).map((user) => [user.id, { full_name: user.full_name, job_title: user.job_title ?? null }]));
  const raterUser = evaluation.supervisor_user_id ? userLookup.get(evaluation.supervisor_user_id) ?? null : null;
  const reviewingSupervisorUser = step3Result?.data?.reviewer_user_id ? userLookup.get(step3Result.data.reviewer_user_id) ?? null : null;
  const personnelUser = personnelResult?.data?.personnel_user_id ? userLookup.get(personnelResult.data.personnel_user_id) ?? null : null;
  const committeeUser = committeeResult?.data?.committee_user_id ? userLookup.get(committeeResult.data.committee_user_id) ?? null : null;
  const presidentUser = evaluation.finalized_by ? userLookup.get(evaluation.finalized_by) ?? null : null;
  const raterName = raterUser?.full_name ?? "—";
  const raterTitle = raterUser?.job_title ?? "Rater";
  const reviewingSupervisorName = reviewingSupervisorUser?.full_name ?? "—";
  const reviewingSupervisorTitle = reviewingSupervisorUser?.job_title ?? "Reviewing Supervisor / Division Head";
  const personnelName = personnelUser?.full_name ?? "—";
  const committeeName = committeeUser?.full_name ?? "—";
  const presidentName = presidentUser?.full_name ?? "—";
  const employeeName = employeeRecordResult?.data?.full_name ?? evaluation.full_name_snapshot ?? "—";
  const employeeJobTitle = employeeRecordResult?.data?.job_title ?? evaluation.job_title_snapshot ?? "Ratee";
  const employeeSignatureDate = employeeSignatureResult?.data?.signed_at ?? null;

  const drawText = (text: string, size = 10, x = 42, fontVariant = font, color = rgb(0.08, 0.12, 0.18), maxWidth?: number) => {
    page.drawText(text, { x, y: 0, size, font: fontVariant, color, maxWidth });
  };

  const drawLine = (startX: number, endX: number, yPos: number, thickness = 0.8) => {
    page.drawLine({ start: { x: startX, y: yPos }, end: { x: endX, y: yPos }, thickness, color: rgb(0.68, 0.7, 0.72) });
  };

  const fieldValue = (value: unknown, fallback = "") => normalizeText(value) || fallback;

  const drawField = ({
    label,
    value,
    labelX,
    valueX,
    valueWidth,
    yPos,
    labelFont = bold,
    valueFont = font,
  }: {
    label: string;
    value: unknown;
    labelX: number;
    valueX: number;
    valueWidth: number;
    yPos: number;
    labelFont?: typeof font;
    valueFont?: typeof font;
  }) => {
    const text = fieldValue(value, "—");
    page.drawText(label, { x: labelX, y: yPos, size: 9, font: labelFont, color: rgb(0.14, 0.16, 0.2) });
    page.drawText(text, { x: valueX, y: yPos, size: 9, font: valueFont, color: rgb(0.14, 0.16, 0.2), maxWidth: valueWidth });
  };

  const drawBreaker = (yPos: number) => drawLine(36, 576, yPos);

  const drawSignatureBlock = ({
    x,
    label,
    name,
    title,
    date,
    signature,
    yPos,
  }: {
    x: number;
    label: string;
    name: string;
    title: string;
    date: string | null;
    signature: { width?: number; height?: number } | null;
    yPos: number;
  }) => {
    page.drawText(label, { x, y: yPos, size: 10, font: bold, color: rgb(0.14, 0.16, 0.2) });
    if (signature) {
      page.drawImage(signature as never, { x: x + 8, y: yPos - 44, width: 120, height: 26 });
    } else {
      page.drawLine({ start: { x, y: yPos - 28 }, end: { x: x + 120, y: yPos - 28 }, thickness: 1, color: rgb(0.2, 0.2, 0.2) });
    }
    page.drawText(name || "—", { x, y: yPos - 48, size: 9, font, color: rgb(0.14, 0.16, 0.2), maxWidth: 140 });
    page.drawText(title || "—", { x, y: yPos - 64, size: 8, font, color: rgb(0.14, 0.16, 0.2), maxWidth: 150 });
    page.drawText(`Date: ${date ? formatDate(date) : "—"}`, { x, y: yPos - 80, size: 8, font, color: rgb(0.14, 0.16, 0.2), maxWidth: 160 });
    drawLine(x, x + 150, yPos - 92);
  };

  const periodFrom = cycle.starts_at ? formatFormDate(cycle.starts_at) : `January 1, ${cycle.year}`;
  const periodTo = cycle.ends_at ? formatFormDate(cycle.ends_at) : `December 31, ${cycle.year}`;

  page.drawText("PRIORITY HANDLING LOGISTICS, INC.", { x: 156, y: 755, size: 14, font: bold, color: rgb(0.12, 0.16, 0.2) });
  page.drawText("1618-B Copernico St., San Isidro, Makati City", { x: 160, y: 738, size: 9, font, color: rgb(0.12, 0.16, 0.2) });
  page.drawText("PERFORMANCE EVALUATION SHEET", { x: 182, y: 710, size: 15, font: bold, color: rgb(0.12, 0.16, 0.2) });
  page.drawText("FOR NON-SUPERVISORY STAFF", { x: 205, y: 693, size: 10, font: bold, color: rgb(0.12, 0.16, 0.2) });

  drawField({ label: "PERIOD COVERED: FROM", value: periodFrom, labelX: 40, valueX: 190, valueWidth: 165, yPos: 665 });
  drawField({ label: "TO", value: periodTo, labelX: 362, valueX: 390, valueWidth: 160, yPos: 665 });
  drawField({ label: "NAME OF RATEE:", value: evaluation.full_name_snapshot ?? employeeName, labelX: 40, valueX: 160, valueWidth: 178, yPos: 640 });
  drawField({ label: "JOB TITLE OF RATEE:", value: evaluation.job_title_snapshot ?? employeeJobTitle, labelX: 352, valueX: 488, valueWidth: 140, yPos: 640 });
  drawField({ label: "DIVISION / DEPT:", value: evaluation.division_snapshot, labelX: 40, valueX: 170, valueWidth: 170, yPos: 618 });
  drawField({ label: "SECTION / UNIT:", value: evaluation.section_snapshot, labelX: 352, valueX: 482, valueWidth: 130, yPos: 618 });
  drawField({ label: "NAME OF RATER:", value: raterName, labelX: 40, valueX: 160, valueWidth: 170, yPos: 596 });
  drawField({ label: "JOB TITLE OF RATER:", value: raterTitle, labelX: 352, valueX: 492, valueWidth: 130, yPos: 596 });

  page.drawText("RATING: 1 — Poor     2 — Below Average     3 — Average     4 — Above Average     5 — Excellent", {
    x: 42,
    y: 575,
    size: 9,
    font: bold,
    color: rgb(0.14, 0.16, 0.2),
    maxWidth: 500,
  });

  const tableTop = 520;
  const tableLeft = 36;
  const cellHeight = 24;
  const colWidths = { factor: 240, employee: 100, supervisor: 100, reviewer: 120 };
  const colX = { employee: tableLeft + colWidths.factor + 2, supervisor: tableLeft + colWidths.factor + colWidths.employee + 2, reviewer: tableLeft + colWidths.factor + colWidths.employee + colWidths.supervisor + 2 };

  page.drawRectangle({ x: tableLeft, y: tableTop - 26, width: 504, height: 300, borderColor: rgb(0.25, 0.25, 0.25), borderWidth: 1.2 });
  page.drawRectangle({ x: tableLeft, y: tableTop - 26, width: colWidths.factor, height: 26, fillColor: rgb(0.86, 0.86, 0.86), borderColor: rgb(0.25, 0.25, 0.25), borderWidth: 1.0 });
  page.drawRectangle({ x: colX.employee, y: tableTop - 26, width: colWidths.employee, height: 26, fillColor: rgb(0.86, 0.86, 0.86), borderColor: rgb(0.25, 0.25, 0.25), borderWidth: 1.0 });
  page.drawRectangle({ x: colX.supervisor, y: tableTop - 26, width: colWidths.supervisor, height: 26, fillColor: rgb(0.86, 0.86, 0.86), borderColor: rgb(0.25, 0.25, 0.25), borderWidth: 1.0 });
  page.drawRectangle({ x: colX.reviewer, y: tableTop - 26, width: colWidths.reviewer, height: 26, fillColor: rgb(0.86, 0.86, 0.86), borderColor: rgb(0.25, 0.25, 0.25), borderWidth: 1.0 });

  page.drawText("PERFORMANCE EVALUATION FACTOR", { x: tableLeft + 10, y: tableTop - 18, size: 9, font: bold, color: rgb(0.12, 0.16, 0.2) });
  page.drawText("EMPLOYEE / RATEE", { x: colX.employee + 14, y: tableTop - 18, size: 8, font: bold, color: rgb(0.12, 0.16, 0.2) });
  page.drawText("SUPERVISOR / RATER", { x: colX.supervisor + 14, y: tableTop - 18, size: 8, font: bold, color: rgb(0.12, 0.16, 0.2) });
  page.drawText("REVIEWING SUPERVISOR / DIVISION HEAD", { x: colX.reviewer + 8, y: tableTop - 18, size: 8, font: bold, color: rgb(0.12, 0.16, 0.2), maxWidth: 102 });

  for (let index = 0; index < criteria.length; index += 1) {
    const criterion = criteria[index];
    const rowY = tableTop - 26 - (index + 1) * cellHeight;
    page.drawRectangle({ x: tableLeft, y: rowY, width: colWidths.factor, height: cellHeight, borderColor: rgb(0.25, 0.25, 0.25), borderWidth: 1.0 });
    page.drawRectangle({ x: colX.employee, y: rowY, width: colWidths.employee, height: cellHeight, borderColor: rgb(0.25, 0.25, 0.25), borderWidth: 1.0 });
    page.drawRectangle({ x: colX.supervisor, y: rowY, width: colWidths.supervisor, height: cellHeight, borderColor: rgb(0.25, 0.25, 0.25), borderWidth: 1.0 });
    page.drawRectangle({ x: colX.reviewer, y: rowY, width: colWidths.reviewer, height: cellHeight, borderColor: rgb(0.25, 0.25, 0.25), borderWidth: 1.0 });

    const rowLabel = `${criterion.letter}. ${criterion.title}`;
    page.drawText(rowLabel, { x: tableLeft + 8, y: rowY + 8, size: 8, font, color: rgb(0.12, 0.16, 0.2), maxWidth: 210 });
    const employeeRating = ratingMap.get(criterion.id)?.EMPLOYEE ?? "";
    const supervisorRating = ratingMap.get(criterion.id)?.SUPERVISOR ?? "";
    const reviewingRating = ratingMap.get(criterion.id)?.REVIEWING_SUPERVISOR ?? "";
    page.drawText(String(employeeRating), { x: colX.employee + 44, y: rowY + 8, size: 8, font: bold, color: rgb(0.12, 0.16, 0.2) });
    page.drawText(String(supervisorRating), { x: colX.supervisor + 44, y: rowY + 8, size: 8, font: bold, color: rgb(0.12, 0.16, 0.2) });
    page.drawText(String(reviewingRating), { x: colX.reviewer + 52, y: rowY + 8, size: 8, font: bold, color: rgb(0.12, 0.16, 0.2) });
  }

  const signatureTop = 200;
  drawSignatureBlock({ x: 42, label: "APPRAISED BY:", name: raterName, title: raterTitle, date: stageSignatures.get("RATER_STEP2")?.signed_at ?? null, signature: raterSig, yPos: signatureTop });
  drawSignatureBlock({ x: 220, label: "REVIEWED BY:", name: reviewingSupervisorName, title: reviewingSupervisorTitle, date: stageSignatures.get("REVIEWING_SUPERVISOR_STEP3")?.signed_at ?? null, signature: reviewingSupervisorSig, yPos: signatureTop });
  drawSignatureBlock({ x: 398, label: "REVIEWED WITH ME:", name: employeeName, title: employeeJobTitle, date: employeeSignatureDate, signature: employeeSig, yPos: signatureTop });

  page.drawText("CONCLUSIONS AND COMMENTS (CONFIDENTIAL: NOT TO BE SHOWN TO RATEE)", { x: 92, y: 150, size: 11, font: bold, color: rgb(0.12, 0.16, 0.2) });
  page.drawText("STEP TWO: DEVELOP CONCLUSION AND COMMENTS", { x: 40, y: 122, size: 10, font: bold, color: rgb(0.12, 0.16, 0.2) });
  page.drawText("1. If the overall rating is excellent or poor, explain why the employee was rated such or support rating with specific incidents.", { x: 40, y: 100, size: 8, font, color: rgb(0.12, 0.16, 0.2), maxWidth: 520 });
  const step2Strengths = fieldValue(evaluation.supervisor_step2_strengths ?? "", "");
  const step2Weaknesses = fieldValue(evaluation.supervisor_step2_weaknesses ?? "", "");
  if (step2Strengths) {
    page.drawText("Principal Strengths:", { x: 40, y: 88, size: 8, font: bold, color: rgb(0.12, 0.16, 0.2) });
    page.drawText(step2Strengths, { x: 165, y: 88, size: 8, font, color: rgb(0.12, 0.16, 0.2), maxWidth: 350 });
  }
  if (step2Weaknesses) {
    page.drawText("Principal Weaknesses:", { x: 40, y: 72, size: 8, font: bold, color: rgb(0.12, 0.16, 0.2) });
    page.drawText(step2Weaknesses, { x: 165, y: 72, size: 8, font, color: rgb(0.12, 0.16, 0.2), maxWidth: 350 });
  }

  const step3Comments = fieldValue(step3Result?.data?.comments ?? "", "");
  const step3Recommendations = fieldValue(step3Result?.data?.recommendations ?? "", "");
  if (step3Comments || step3Recommendations) {
    page.drawText("STEP THREE: REVIEWING SUPERVISOR / DIVISION HEAD COMMENTS AND RECOMMENDATIONS", { x: 40, y: 52, size: 9, font: bold, color: rgb(0.12, 0.16, 0.2) });
    if (step3Comments) {
      page.drawText(step3Comments, { x: 40, y: 38, size: 8, font, color: rgb(0.12, 0.16, 0.2), maxWidth: 240 });
    }
    if (step3Recommendations) {
      page.drawText(step3Recommendations, { x: 310, y: 38, size: 8, font, color: rgb(0.12, 0.16, 0.2), maxWidth: 240 });
    }
  }

  const bytes = await pdf.save();
  const versionLabel = evaluation.version ?? 1;
  const path = `employees/${evaluation.employee_id}/evaluations/${cycle.year}-final-performance-evaluation-v${versionLabel}.pdf`;
  const { error: uploadError } = await admin.storage.from("employee-files").upload(path, bytes, { contentType: "application/pdf", upsert: true });
  if (uploadError) throw new Error(uploadError.message);

  const payload = {
    employee_id: evaluation.employee_id,
    evaluation_id: evaluationId,
    evaluation_version: versionLabel,
    category: "PERFORMANCE_EVALUATIONS",
    file_name: `${cycle.year} Final Performance Evaluation v${versionLabel}.pdf`,
    storage_path: path,
    content_type: "application/pdf",
    file_size: bytes.length,
    created_by: userId,
  };

  let document;
  if (existingDocument.data?.id) {
    const { data: updated, error } = await admin
      .from("employee_documents")
      .update(payload)
      .eq("id", existingDocument.data.id)
      .select()
      .single();
    if (error) throw new Error(error.message);
    document = updated;
  } else {
    const { data: inserted, error } = await admin
      .from("employee_documents")
      .insert(payload)
      .select()
      .single();
    if (error) throw new Error(error.message);
    document = inserted;
  }

  return document;
}
