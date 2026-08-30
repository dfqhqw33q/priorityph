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

async function loadSignatureImage(pdf: PDFDocument, admin: Awaited<ReturnType<typeof getAdmin>>, entry: { method: string; signature_data: string | null; storage_path: string | null; content_type?: string | null } | null) {
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

function drawField(page: any, font: any, y: number, label: string, value: string, x = 42) {
  page.drawText(label, { x, y, size: 9, font, color: rgb(0.12, 0.15, 0.2) });
  page.drawText(value || "—", { x: x + 150, y, size: 9, font, color: rgb(0.12, 0.15, 0.2) });
  return y - 16;
}

export async function createFinalEvaluationDocument(evaluationId: string, userId: string) {
  const admin = await getAdmin();
  const { data: evaluation } = await admin
    .from("evaluations")
    .select(
      "id, employee_id, employee_number_snapshot, full_name_snapshot, job_title_snapshot, division_snapshot, section_snapshot, status, finalized_at, finalized_by, finalization_reason, supervisor_user_id, supervisor_submitted_at, supervisor_step2_strengths, supervisor_step2_weaknesses, supervisor_step2_development, supervisor_step2_advancement, supervisor_step2_career_transfer, supervisor_step2_recommendations, supervisor_step2_growth_suggestions, supervisor_step2_transfer_interest, supervisor_step2_transfer_job, supervisor_step2_transfer_where, supervisor_step2_transfer_qualified, supervisor_step2_other_comments, supervisor_step2_date, supervisor_remarks, cycle_id, evaluation_cycles(name, year, starts_at, ends_at, template_id)",
    )
    .eq("id", evaluationId)
    .maybeSingle();
  if (!evaluation) throw validationError("Evaluation not found");

  const cycle = (evaluation as never as { evaluation_cycles: { name: string; year: number; starts_at: string; ends_at: string; template_id: string } }).evaluation_cycles;

  const [criteriaResult, ratingsResult, scoreResult, step2Result, step3Result, personnelResult, committeeResult, signaturesResult] = await Promise.all([
    admin.from("evaluation_criteria").select("id, letter, title, description, position").eq("template_id", cycle.template_id).order("position"),
    admin.from("evaluation_ratings").select("criterion_id, evaluator_type, rating").eq("evaluation_id", evaluationId),
    admin.from("evaluation_scores").select("final_score, final_rating_label, president_average, rule_version").eq("evaluation_id", evaluationId).maybeSingle(),
    admin.from("evaluations").select("supervisor_step2_strengths, supervisor_step2_weaknesses, supervisor_step2_development, supervisor_step2_advancement, supervisor_step2_career_transfer, supervisor_step2_recommendations, supervisor_step2_growth_suggestions, supervisor_step2_transfer_interest, supervisor_step2_transfer_job, supervisor_step2_transfer_where, supervisor_step2_transfer_qualified, supervisor_step2_other_comments, supervisor_step2_date, supervisor_remarks").eq("id", evaluationId).maybeSingle(),
    admin.from("reviewing_supervisor_reviews").select("comments, recommendations, reviewing_supervisor_date, reviewer_user_id").eq("evaluation_id", evaluationId).maybeSingle(),
    admin.from("personnel_processing").select("present_salary, last_increase_date, last_increase_nature, last_increase_amount, total_points, adjective_rating, recommended_increase_bonus").eq("evaluation_id", evaluationId).maybeSingle(),
    admin.from("committee_reviews").select("final_action, action_details, recommendation, committee_user_id").eq("evaluation_id", evaluationId).maybeSingle(),
    admin.from("evaluation_stage_signatures").select("stage, method, storage_path, signature_data, signed_at, content_type").eq("evaluation_id", evaluationId),
  ]);

  const criteria = criteriaResult.data ?? [];
  const ratings = ratingsResult.data ?? [];
  const ratingMap = new Map<string, Record<string, number | undefined>>();
  for (const row of ratings) {
    const criterionKey = row.criterion_id;
    if (!ratingMap.has(criterionKey)) ratingMap.set(criterionKey, {});
    const item = ratingMap.get(criterionKey)!;
    item[row.evaluator_type] = row.rating;
  }

  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);

  let page = pdf.addPage([612, 792]);
  let y = 760;

  const draw = (text: string, size = 10, boldText = false, x = 42) => {
    if (y < 52) {
      page = pdf.addPage([612, 792]);
      y = 760;
    }
    page.drawText(text, { x, y, size, font: boldText ? bold : font, color: rgb(0.08, 0.1, 0.15) });
    y -= size + 5;
  };

  const drawLine = (startX: number, endX: number, startY = y) => {
    page.drawLine({ start: { x: startX, y: startY }, end: { x: endX, y: startY }, thickness: 0.7, color: rgb(0.7, 0.72, 0.76) });
    y -= 12;
  };

  draw("PRIORITY HANDLING LOGISTICS, INC.", 16, true, 150);
  draw("PERFORMANCE EVALUATION SHEET", 13, true, 185);
  draw(`FOR NON-SUPERVISORY STAFF • ${cycle.name} (${cycle.year})`, 10, false, 120);
  drawLine(42, 570);
  y = drawField(page, font, y, "Employee number", evaluation.employee_number_snapshot) || y;
  y = drawField(page, font, y, "Employee name", evaluation.full_name_snapshot) || y;
  y = drawField(page, font, y, "Job title", evaluation.job_title_snapshot) || y;
  y = drawField(page, font, y, "Division", evaluation.division_snapshot) || y;
  y = drawField(page, font, y, "Section", evaluation.section_snapshot) || y;
  y = drawField(page, font, y, "Finalized", formatDate(evaluation.finalized_at as string | null | undefined)) || y;
  drawLine(42, 570);

  page.drawText("PERFORMANCE EVALUATION FACTOR", { x: 42, y, size: 10, font: bold });
  page.drawText("1", { x: 470, y, size: 10, font: bold });
  page.drawText("2", { x: 495, y, size: 10, font: bold });
  page.drawText("3", { x: 520, y, size: 10, font: bold });
  page.drawText("4", { x: 545, y, size: 10, font: bold });
  page.drawText("5", { x: 570, y, size: 10, font: bold });
  y -= 18;
  for (const criterion of criteria) {
    const row = ratingMap.get(criterion.id) ?? {};
    const cellX = [470, 495, 520, 545, 570];
    page.drawText(`${criterion.letter}. ${criterion.title}`, { x: 42, y, size: 8, font });
    for (let index = 0; index < 5; index += 1) {
      const value = index + 1;
      const marked = row.EMPLOYEE === value || row.SUPERVISOR === value || row.REVIEWING_SUPERVISOR === value || row.PRESIDENT === value ? "X" : "";
      page.drawText(marked, { x: cellX[index], y, size: 8, font: bold });
    }
    y -= 16;
  }
  y -= 10;
  drawLine(42, 570);
  draw("CONCLUSIONS AND COMMENTS", 12, true, 190);
  draw("CONFIDENTIAL: NOT TO BE SHOWN TO RATEE", 9, false, 150);
  draw("STEP TWO: Develop conclusion and comments", 10, true, 42);
  const step2 = step2Result?.data ?? (evaluation as never);
  const step2Blocks = [
    ["Principal strengths", step2?.supervisor_step2_strengths ?? ""],
    ["Principal weakness", step2?.supervisor_step2_weaknesses ?? ""],
    ["Development", step2?.supervisor_step2_development ?? ""],
    ["Advancement outlook", step2?.supervisor_step2_advancement ?? ""],
    ["Career transfer", step2?.supervisor_step2_career_transfer ?? ""],
    ["Growth suggestions", step2?.supervisor_step2_growth_suggestions ?? ""],
    ["Transfer interest", step2?.supervisor_step2_transfer_interest ?? ""],
    ["Transfer job", step2?.supervisor_step2_transfer_job ?? ""],
    ["Transfer where", step2?.supervisor_step2_transfer_where ?? ""],
    ["Transfer qualified", step2?.supervisor_step2_transfer_qualified ?? ""],
    ["Other comments", step2?.supervisor_step2_other_comments ?? ""],
  ] as const;
  for (const [label, value] of step2Blocks) {
    if (!value) continue;
    draw(`${label}: ${value}`, 8, false, 42);
  }
  draw(`Rater signature date: ${formatDate(step2?.supervisor_step2_date as string | null | undefined)}`, 8, false, 42);
  drawLine(42, 570);
  draw("STEP THREE: Reviewed by the Reviewing Supervisor", 10, true, 42);
  const step3 = step3Result?.data;
  draw(`Comments: ${step3?.comments ?? "—"}`, 8, false, 42);
  draw(`Recommendations: ${step3?.recommendations ?? "—"}`, 8, false, 42);
  draw(`Reviewing supervisor date: ${formatDate(step3?.reviewing_supervisor_date as string | null | undefined)}`, 8, false, 42);
  drawLine(42, 570);
  draw("PERSONNEL OFFICE", 10, true, 42);
  const personnel = personnelResult?.data;
  draw(`Present salary: ${personnel?.present_salary ?? "—"}`, 8, false, 42);
  draw(`Last increase date: ${formatDate(personnel?.last_increase_date as string | null | undefined)}`, 8, false, 42);
  draw(`Nature of last increase: ${personnel?.last_increase_nature ?? "—"}`, 8, false, 42);
  draw(`Amount of last increase: ${personnel?.last_increase_amount ?? "—"}`, 8, false, 42);
  draw(`Total points: ${personnel?.total_points ?? "—"}`, 8, false, 42);
  draw(`Adjective rating: ${personnel?.adjective_rating ?? "—"}`, 8, false, 42);
  draw(`Recommended increase / bonus: ${personnel?.recommended_increase_bonus ?? "—"}`, 8, false, 42);
  drawLine(42, 570);
  draw("FINAL ACTION RECOMMENDED BY THE PERFORMANCE EVALUATION COMMITTEE", 10, true, 42);
  const committee = committeeResult?.data;
  draw(`Final action: ${committee?.final_action ?? "—"}`, 8, false, 42);
  draw(`Action details: ${committee?.action_details ?? "—"}`, 8, false, 42);
  draw(`Recommendation: ${committee?.recommendation ?? "—"}`, 8, false, 42);
  drawLine(42, 570);
  draw("PRESIDENT APPROVAL", 10, true, 42);
  draw(`Final decision: ${evaluation.status === "FINALIZED" ? "APPROVED AND FINALIZED" : "PENDING"}`, 8, false, 42);
  draw(`Finalization date: ${formatDate(evaluation.finalized_at as string | null | undefined)}`, 8, false, 42);
  draw(`Finalization reason: ${evaluation.finalization_reason ?? "—"}`, 8, false, 42);

  const signatures = signaturesResult.data ?? [];
  const signatureByStage = new Map(signatures.map((entry) => [entry.stage, entry]));
  const stageSignaturePositions: [string, number, number][] = [
    ["RATER_STEP2", 90, 230],
    ["REVIEWING_SUPERVISOR_STEP3", 220, 230],
    ["PERSONNEL", 350, 230],
    ["COMMITTEE", 480, 230],
    ["PRESIDENT", 260, 120],
  ];
  for (const [stage, x, yPos] of stageSignaturePositions) {
    const signatureEntry = signatureByStage.get(stage);
    const signatureImage = await loadSignatureImage(pdf, admin, signatureEntry as any);
    if (signatureImage) {
      page.drawImage(signatureImage, { x, y: yPos, width: 120, height: 30 });
    }
  }

  const bytes = await pdf.save();
  const path = `employees/${evaluation.employee_id}/evaluations/${cycle.year}-final-performance-evaluation.pdf`;
  const { error: uploadError } = await admin.storage.from("employee-files").upload(path, bytes, { contentType: "application/pdf", upsert: true });
  if (uploadError) throw validationError(uploadError.message);

  const { data: document, error } = await admin
    .from("employee_documents")
    .upsert(
      {
        employee_id: evaluation.employee_id,
        evaluation_id: evaluationId,
        category: "PERFORMANCE_EVALUATIONS",
        file_name: `${cycle.year} Final Performance Evaluation.pdf`,
        storage_path: path,
        content_type: "application/pdf",
        file_size: bytes.length,
        created_by: userId,
      },
      { onConflict: "evaluation_id" },
    )
    .select()
    .single();
  if (error) throw validationError(error.message);
  return document;
}
