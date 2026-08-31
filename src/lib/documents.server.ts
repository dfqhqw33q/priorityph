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

  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);

  const pages: { page: any; y: number }[] = [];
  let page = pdf.addPage([612, 792]);
  let y = 760;
  const addPage = () => {
    page = pdf.addPage([612, 792]);
    y = 760;
    pages.push({ page, y });
  };
  pages.push({ page, y });

  const ensureSpace = (needed = 18) => {
    if (y <= needed) {
      addPage();
    }
  };

  const drawText = (text: string, size = 10, x = 42, fontVariant = font, color = rgb(0.08, 0.12, 0.18), maxWidth?: number) => {
    ensureSpace(size + 8);
    page.drawText(text, { x, y, size, font: fontVariant, color, maxWidth });
    y -= size + 5;
  };

  const drawLine = (startX: number, endX: number, startY = y) => {
    page.drawLine({ start: { x: startX, y: startY }, end: { x: endX, y: startY }, thickness: 0.7, color: rgb(0.72, 0.73, 0.76) });
    y -= 12;
  };

  const drawLabelValue = (label: string, value: unknown, x = 42, valueX = 190) => {
    const displayValue = normalizeText(value) || "—";
    drawText(label, 9, x, font, rgb(0.12, 0.15, 0.2), 140);
    page.drawText(displayValue, { x: valueX, y, size: 9, font, color: rgb(0.12, 0.15, 0.2), maxWidth: 360 });
    y -= 16;
  };

  const drawParagraph = (label: string, textValue: unknown, options?: { maxWidth?: number; labelX?: number; valueX?: number; size?: number; labelBold?: boolean; indent?: number }) => {
    const safeValue = normalizeText(textValue) || "—";
    const size = options?.size ?? 9;
    const labelX = options?.labelX ?? 42;
    const valueX = options?.valueX ?? 190;
    const maxWidth = options?.maxWidth ?? 350;

    ensureSpace(28);
    page.drawText(label, { x: labelX, y, size, font: options?.labelBold ? bold : font, color: rgb(0.12, 0.15, 0.2) });
    const wrapped = wrapText(safeValue, 90);
    let currentY = y;
    for (let index = 0; index < wrapped.length; index += 1) {
      const line = wrapped[index] ?? "";
      page.drawText(line, { x: valueX, y: currentY, size, font, color: rgb(0.12, 0.15, 0.2), maxWidth });
      currentY -= size + 4;
    }
    y = currentY - 8;
  };

  drawText("PRIORITY HANDLING LOGISTICS, INC.", 16, 150, bold);
  drawText("PERFORMANCE EVALUATION SHEET", 13, 170, bold);
  drawText(`FOR NON-SUPERVISORY STAFF • ${cycle.name} (${cycle.year})`, 10, 160, font);
  drawLine(42, 570);

  drawLabelValue("Employee number", evaluation.employee_number_snapshot);
  drawLabelValue("Employee name", evaluation.full_name_snapshot);
  drawLabelValue("Job title", evaluation.job_title_snapshot);
  drawLabelValue("Division / department", evaluation.division_snapshot);
  drawLabelValue("Section / unit", evaluation.section_snapshot);
  drawLabelValue("Period covered", `${cycle.starts_at ? formatDate(cycle.starts_at) : "—"} to ${cycle.ends_at ? formatDate(cycle.ends_at) : "—"}`);
  drawLabelValue("Status", statusLabel);
  drawLine(42, 570);

  drawText("PERFORMANCE EVALUATION FACTOR", 10, 42, bold);
  drawText("EMPLOYEE / RATEE", 8, 360, bold);
  drawText("SUPERVISOR / RATER", 8, 430, bold);
  drawText("REVIEWING SUPERVISOR / DIVISION HEAD", 8, 500, bold);
  y -= 10;
  for (const criterion of criteria) {
    const row = ratingMap.get(criterion.id) ?? {};
    const rowLabel = `${criterion.letter}. ${criterion.title}`;
    page.drawText(rowLabel, { x: 42, y, size: 8, font, color: rgb(0.12, 0.15, 0.2), maxWidth: 280 });
    const values = [row.EMPLOYEE, row.SUPERVISOR, row.REVIEWING_SUPERVISOR];
    const positions = [372, 445, 540];
    for (let index = 0; index < values.length; index += 1) {
      const value = values[index];
      page.drawText(value ? String(value) : "", { x: positions[index], y, size: 8, font: bold, color: rgb(0.12, 0.15, 0.2) });
    }
    y -= 16;
  }
  drawLine(42, 570);

  drawText("STEP 1 — EMPLOYEE / SUPERVISOR / REVIEWING SUPERVISOR RATINGS", 10, 150, bold);
  drawText(`Rater: ${raterName}`, 9, 42, font);
  drawText(`Reviewing supervisor: ${reviewingSupervisorName}`, 9, 300, font);
  y -= 10;

  drawParagraph("Principal strengths", evaluation.supervisor_step2_strengths ?? "", { valueX: 190, maxWidth: 330 });
  drawParagraph("Principal weaknesses", evaluation.supervisor_step2_weaknesses ?? "", { valueX: 190, maxWidth: 330 });
  drawParagraph("Overall rating explanation", evaluation.supervisor_step2_overall_explanation ?? "", { valueX: 190, maxWidth: 330 });
  drawParagraph("Present-job effectiveness", evaluation.supervisor_step2_effectiveness ?? "", { valueX: 190, maxWidth: 330 });
  drawParagraph("Development potential", evaluation.supervisor_step2_development_potential ?? "", { valueX: 190, maxWidth: 330 });
  drawParagraph("Advancement outlook", evaluation.supervisor_step2_advancement_outlook ?? "", { valueX: 190, maxWidth: 330 });
  drawParagraph("Growth and development suggestions", evaluation.supervisor_step2_growth_suggestions ?? "", { valueX: 190, maxWidth: 330 });
  drawParagraph("Job/transfer interest", evaluation.supervisor_step2_transfer_interest ?? "", { valueX: 190, maxWidth: 330 });
  drawParagraph("Transfer job", evaluation.supervisor_step2_transfer_job ?? "", { valueX: 190, maxWidth: 330 });
  drawParagraph("Transfer where", evaluation.supervisor_step2_transfer_where ?? "", { valueX: 190, maxWidth: 330 });
  drawParagraph("Transfer qualified", evaluation.supervisor_step2_transfer_qualified ?? "", { valueX: 190, maxWidth: 330 });
  drawParagraph("Other comments / recommendations", evaluation.supervisor_step2_other_comments ?? "", { valueX: 190, maxWidth: 330 });
  drawParagraph("Supervisor remarks", evaluation.supervisor_remarks ?? "", { valueX: 190, maxWidth: 330 });

  const step3 = step3Result?.data ?? null;
  drawText("STEP 2 — REVIEWING SUPERVISOR / DIVISION HEAD", 10, 150, bold);
  drawParagraph("Reviewing supervisor comments", step3?.comments ?? "", { valueX: 230, maxWidth: 300 });
  drawParagraph("Reviewing supervisor recommendations", step3?.recommendations ?? "", { valueX: 230, maxWidth: 300 });
  drawLabelValue("Reviewing supervisor date", step3?.reviewing_supervisor_date ?? "—");
  drawLine(42, 570);

  const personnel = personnelResult?.data ?? null;
  drawText("PERSONNEL OFFICE", 10, 180, bold);
  drawLabelValue("Present salary", personnel?.present_salary ?? "—");
  drawLabelValue("Last increase date", personnel?.last_increase_date ?? "—");
  drawLabelValue("Nature of last increase", personnel?.last_increase_nature ?? "—");
  drawLabelValue("Amount of last increase", personnel?.last_increase_amount ?? "—");
  drawLabelValue("Total points", personnel?.total_points ?? "—");
  drawLabelValue("Adjective rating", personnel?.adjective_rating ?? "—");
  drawLabelValue("Recommended increase / bonus", personnel?.recommended_increase_bonus ?? "—");
  drawLabelValue("Personnel reviewer", personnelName);
  drawLine(42, 570);

  const committee = committeeResult?.data ?? null;
  drawText("COMMITTEE REVIEW", 10, 200, bold);
  drawLabelValue("Final action", committee?.final_action ?? "—");
  drawParagraph("Action details", committee?.action_details ?? "", { valueX: 200, maxWidth: 330 });
  drawParagraph("Committee recommendation", committee?.recommendation ?? "", { valueX: 200, maxWidth: 330 });
  drawLabelValue("Committee reviewer", committeeName);
  drawLine(42, 570);

  drawText("PRESIDENT APPROVAL", 10, 180, bold);
  drawLabelValue("Final decision", statusLabel === "FINALIZED" ? "APPROVED AND FINALIZED" : "PENDING");
  drawLabelValue("Date finalized", finalizedAt ? formatDate(finalizedAt) : "—");
  drawLabelValue("Reason", finalizationReason ?? "—");
  drawLabelValue("President", presidentName);
  drawLine(42, 570);

  const stageSignatures = new Map((stageSignatureResult.data ?? []).map((entry) => [entry.stage, entry]));
  const employeeSig = employeeSignatureResult?.data ? await loadSignatureImage(pdf, admin, employeeSignatureResult.data as never) : null;
  const raterSignature = await loadSignatureImage(pdf, admin, stageSignatures.get("RATER_STEP2") as never);
  const reviewingSignature = await loadSignatureImage(pdf, admin, stageSignatures.get("REVIEWING_SUPERVISOR_STEP3") as never);
  const personnelSignature = await loadSignatureImage(pdf, admin, stageSignatures.get("PERSONNEL") as never);
  const committeeSignature = await loadSignatureImage(pdf, admin, stageSignatures.get("COMMITTEE") as never);
  const presidentSignature = await loadSignatureImage(pdf, admin, stageSignatures.get("PRESIDENT") as never);

  const drawSignatureBlock = ({
    x,
    label,
    name,
    title,
    date,
    signature,
  }: {
    x: number;
    label: string;
    name: string;
    title: string;
    date: string | null;
    signature: { width?: number; height?: number } | null;
  }) => {
    page.drawText(label, { x, y: 620, size: 9, font: bold, color: rgb(0.12, 0.15, 0.2) });
    if (signature) {
      page.drawImage(signature as never, { x, y: 585, width: 135, height: 28 });
    }
    page.drawText(name || "—", { x, y: 560, size: 9, font, color: rgb(0.12, 0.15, 0.2), maxWidth: 170 });
    page.drawText(title || "—", { x, y: 545, size: 8, font, color: rgb(0.12, 0.15, 0.2), maxWidth: 170 });
    page.drawText(`Date: ${date ? formatDate(date) : "—"}`, { x, y: 530, size: 8, font, color: rgb(0.12, 0.15, 0.2), maxWidth: 170 });
  };

  const raterSignedAt = stageSignatures.get("RATER_STEP2")?.signed_at ?? null;
  const reviewingSignedAt = stageSignatures.get("REVIEWING_SUPERVISOR_STEP3")?.signed_at ?? null;

  drawSignatureBlock({
    x: 38,
    label: "APPRAISED BY:",
    name: raterName,
    title: raterTitle,
    date: raterSignedAt,
    signature: raterSignature,
  });
  drawSignatureBlock({
    x: 225,
    label: "REVIEWED BY:",
    name: reviewingSupervisorName,
    title: reviewingSupervisorTitle,
    date: reviewingSignedAt,
    signature: reviewingSignature,
  });
  drawSignatureBlock({
    x: 412,
    label: "REVIEWED WITH ME:",
    name: employeeName,
    title: employeeJobTitle,
    date: employeeSignatureDate,
    signature: employeeSig,
  });

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
