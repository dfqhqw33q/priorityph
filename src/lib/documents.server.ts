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

  const addPage = () => pdf.addPage([612, 792]);
  let currentPage = addPage();
  let currentY = 760;

  const ensureSpace = (required: number) => {
    if (currentY - required < 48) {
      currentPage = addPage();
      currentY = 760;
    }
    return currentPage;
  };

  const drawTextLine = (text: string, x: number, y: number, size = 9, weight = font, color = rgb(0.12, 0.16, 0.2), maxWidth?: number) => {
    currentPage.drawText(text, { x, y, size, font: weight, color, maxWidth });
  };

  const drawWrappedBlock = (
    text: string,
    x: number,
    width: number,
    size: number,
    opts: { leading?: number; font?: typeof font; color?: ReturnType<typeof rgb>; maxLines?: number } = {},
  ) => {
    const leading = opts.leading ?? size + 2;
    const maxLines = opts.maxLines ?? 12;
    const lines = wrapText(text, Math.max(18, Math.floor(width / (size * 0.56))));
    const actualLines = lines.slice(0, maxLines);
    for (let index = 0; index < actualLines.length; index += 1) {
      const line = actualLines[index];
      currentPage.drawText(line, { x, y: currentY - (index * leading), size, font: opts.font ?? font, color: opts.color ?? rgb(0.12, 0.16, 0.2), maxWidth: width });
    }
    currentY -= Math.max(leading, actualLines.length * leading);
  };

  const drawHorizontalRule = (x1: number, x2: number, y: number, thickness = 0.7) => {
    currentPage.drawLine({ start: { x: x1, y }, end: { x: x2, y }, thickness, color: rgb(0.72, 0.73, 0.75) });
  };

  const drawField = ({
    label,
    value,
    labelX,
    valueX,
    valueWidth,
    y,
  }: { label: string; value: unknown; labelX: number; valueX: number; valueWidth: number; y: number }) => {
    const text = normalizeText(value) || "—";
    currentPage.drawText(label, { x: labelX, y, size: 9, font: bold, color: rgb(0.12, 0.16, 0.2) });
    currentPage.drawText(text, { x: valueX, y, size: 9, font, color: rgb(0.12, 0.16, 0.2), maxWidth: valueWidth });
  };

  const drawSignatureBlock = ({
    x,
    label,
    name,
    title,
    date,
    signature,
    y,
  }: {
    x: number;
    label: string;
    name: string;
    title: string;
    date: string | null;
    signature: { width?: number; height?: number } | null;
    y: number;
  }) => {
    const blockY = y;
    currentPage.drawText(label, { x, y: blockY, size: 9, font: bold, color: rgb(0.14, 0.16, 0.2) });
    const sigLineY = blockY - 28;
    if (signature) {
      currentPage.drawImage(signature as never, { x: x + 10, y: blockY - 44, width: 120, height: 30 });
    } else {
      currentPage.drawLine({ start: { x: x + 4, y: sigLineY }, end: { x: x + 134, y: sigLineY }, thickness: 1, color: rgb(0.2, 0.2, 0.2) });
    }
    currentPage.drawText(name || "—", { x, y: blockY - 46, size: 9, font, color: rgb(0.14, 0.16, 0.2), maxWidth: 150 });
    currentPage.drawText(title || "—", { x, y: blockY - 60, size: 8, font, color: rgb(0.14, 0.16, 0.2), maxWidth: 150 });
    currentPage.drawText(`Date: ${date ? formatDate(date) : "—"}`, { x, y: blockY - 74, size: 8, font, color: rgb(0.14, 0.16, 0.2), maxWidth: 160 });
    drawHorizontalRule(x, x + 150, blockY - 86);
  };

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

  const officialFactorDefinitions = [
    { letter: "A", title: "QUALITY OF WORK", description: "Consider the neatness, accuracy, and completeness of the employee's work in relation to company standards." },
    { letter: "B", title: "QUANTITY OF WORK", description: "Consider the volume of work done by the employee and the speed at which work was satisfactorily completed." },
    { letter: "C", title: "JOB KNOWLEDGE", description: "Consider the employee's skill, knowledge, and understanding of the details of his regularly assigned work." },
    { letter: "D", title: "ABILITY TO LEARN", description: "Consider the employee's ability to learn new job procedures and methods and his speed in grasping instructions." },
    { letter: "E", title: "DEPENDABILITY", description: "Consider the employee's attendance, punctuality and the seriousness with which he performs his duties." },
    { letter: "F", title: "INITIATIVE", description: "Consider the employee's resourcefulness or ability to develop new approaches to problems as required by his job." },
    { letter: "G", title: "HUMAN RELATIONS/TEAMWORK", description: "Consider the employee's ability to get along with co-employees and client personal and his sense of organizational loyalty." },
    { letter: "H", title: "COST CONSCIOUSNESS", description: "Consider the employee's attitude toward cost objectives in relation to his work, his efforts at preventing waste and generating cost savings." },
    { letter: "I", title: "DISCIPLINE", description: "Consider the employee's conduct on the job, his attitude towards company rules and his efforts at promoting harmonious relationships among others." },
    { letter: "J", title: "SAFETY CONSCIOUSNESS/CARE OF EQUIPMENT", description: "Consider the manner in which the employee handles himself, the materials, and the equipment in a work situation and his safety consciousness." },
  ];

  const criteriaByLetter = new Map((criteria ?? []).map((criterion) => [criterion.letter, criterion]));
  const displayCriteria = officialFactorDefinitions.map((factor) => {
    const persisted = criteriaByLetter.get(factor.letter);
    return {
      ...factor,
      id: persisted?.id ?? factor.letter,
      description: persisted?.description?.trim() || factor.description,
      title: persisted?.title?.trim() || factor.title,
    };
  });

  const userLookup = new Map((userListResult.data ?? []).map((user) => [user.id, { full_name: user.full_name, job_title: user.job_title ?? null }]));
  const raterUser = evaluation.supervisor_user_id ? userLookup.get(evaluation.supervisor_user_id) ?? null : null;
  const reviewingSupervisorUser = step3Result?.data?.reviewer_user_id ? userLookup.get(step3Result.data.reviewer_user_id) ?? null : null;
  const personnelUser = personnelResult?.data?.personnel_user_id ? userLookup.get(personnelResult.data.personnel_user_id) ?? null : null;
  const committeeUser = committeeResult?.data?.committee_user_id ? userLookup.get(committeeResult.data.committee_user_id) ?? null : null;
  const presidentUser = evaluation.finalized_by ? userLookup.get(evaluation.finalized_by) ?? null : null;
  const raterName = raterUser?.full_name ?? "—";
  const raterTitle = raterUser?.job_title ?? "Rater / Immediate Supervisor";
  const reviewingSupervisorName = reviewingSupervisorUser?.full_name ?? "—";
  const reviewingSupervisorTitle = reviewingSupervisorUser?.job_title ?? "Reviewing Supervisor / Division Head";
  const personnelName = personnelUser?.full_name ?? "—";
  const committeeName = committeeUser?.full_name ?? "—";
  const presidentName = presidentUser?.full_name ?? "—";
  const employeeName = employeeRecordResult?.data?.full_name ?? evaluation.full_name_snapshot ?? "—";
  const employeeJobTitle = employeeRecordResult?.data?.job_title ?? evaluation.job_title_snapshot ?? "Ratee / Employee";
  const employeeSignatureDate = employeeSignatureResult?.data?.signed_at ?? null;
  const periodFrom = cycle.starts_at ? formatFormDate(cycle.starts_at) : `January 1, ${cycle.year}`;
  const periodTo = cycle.ends_at ? formatFormDate(cycle.ends_at) : `December 31, ${cycle.year}`;

  const page1 = currentPage;
  drawTextLine("PRIORITY HANDLING LOGISTICS, INC.", 160, 764, 14, bold);
  drawTextLine("1618-B Copernico St., San Isidro, Makati City", 160, 748, 9);
  drawTextLine("PERFORMANCE EVALUATION SHEET", 175, 722, 15, bold);
  drawTextLine("FOR NON-SUPERVISORY STAFF", 203, 706, 10, bold);

  drawField({ label: "PERIOD COVERED: FROM", value: periodFrom, labelX: 36, valueX: 188, valueWidth: 170, y: 678 });
  drawField({ label: "TO", value: periodTo, labelX: 358, valueX: 392, valueWidth: 150, y: 678 });
  drawField({ label: "NAME OF RATEE:", value: evaluation.full_name_snapshot ?? employeeName, labelX: 36, valueX: 156, valueWidth: 172, y: 652 });
  drawField({ label: "JOB TITLE OF RATEE:", value: evaluation.job_title_snapshot ?? employeeJobTitle, labelX: 352, valueX: 488, valueWidth: 140, y: 652 });
  drawField({ label: "DIVISION / DEPT:", value: evaluation.division_snapshot, labelX: 36, valueX: 172, valueWidth: 156, y: 628 });
  drawField({ label: "SECTION / UNIT:", value: evaluation.section_snapshot, labelX: 352, valueX: 482, valueWidth: 126, y: 628 });
  drawField({ label: "NAME OF RATER:", value: raterName, labelX: 36, valueX: 156, valueWidth: 170, y: 604 });
  drawField({ label: "JOB TITLE OF RATER:", value: raterTitle, labelX: 352, valueX: 492, valueWidth: 120, y: 604 });

  currentPage.drawText("RATING: 1 — Poor     2 — Below Average     3 — Average     4 — Above Average     5 — Excellent", {
    x: 36,
    y: 580,
    size: 9,
    font: bold,
    color: rgb(0.14, 0.16, 0.2),
    maxWidth: 520,
  });

  const tableTop = 528;
  const tableLeft = 36;
  const rowHeight = 46;
  const colFactor = 245;
  const colEmployee = 95;
  const colSupervisor = 95;
  const colReviewer = 122;
  const colX = { employee: tableLeft + colFactor + 2, supervisor: tableLeft + colFactor + colEmployee + 2, reviewer: tableLeft + colFactor + colEmployee + colSupervisor + 2 };

  currentPage.drawRectangle({ x: tableLeft, y: tableTop - 28, width: 500, height: 370, borderColor: rgb(0.2, 0.2, 0.2), borderWidth: 1.2 });
  currentPage.drawRectangle({ x: tableLeft, y: tableTop - 28, width: colFactor, height: 28, fillColor: rgb(0.86, 0.86, 0.86), borderColor: rgb(0.2, 0.2, 0.2), borderWidth: 1.0 });
  currentPage.drawRectangle({ x: colX.employee, y: tableTop - 28, width: colEmployee, height: 28, fillColor: rgb(0.86, 0.86, 0.86), borderColor: rgb(0.2, 0.2, 0.2), borderWidth: 1.0 });
  currentPage.drawRectangle({ x: colX.supervisor, y: tableTop - 28, width: colSupervisor, height: 28, fillColor: rgb(0.86, 0.86, 0.86), borderColor: rgb(0.2, 0.2, 0.2), borderWidth: 1.0 });
  currentPage.drawRectangle({ x: colX.reviewer, y: tableTop - 28, width: colReviewer, height: 28, fillColor: rgb(0.86, 0.86, 0.86), borderColor: rgb(0.2, 0.2, 0.2), borderWidth: 1.0 });

  currentPage.drawText("PERFORMANCE EVALUATION FACTOR", { x: tableLeft + 8, y: tableTop - 18, size: 9, font: bold, color: rgb(0.12, 0.16, 0.2) });
  currentPage.drawText("EMPLOYEE / RATEE", { x: colX.employee + 8, y: tableTop - 18, size: 8, font: bold, color: rgb(0.12, 0.16, 0.2) });
  currentPage.drawText("SUPERVISOR / RATER", { x: colX.supervisor + 8, y: tableTop - 18, size: 8, font: bold, color: rgb(0.12, 0.16, 0.2) });
  currentPage.drawText("REVIEWING SUPERVISOR / DIVISION HEAD", { x: colX.reviewer + 6, y: tableTop - 18, size: 7.5, font: bold, color: rgb(0.12, 0.16, 0.2), maxWidth: 102 });

  for (let index = 0; index < displayCriteria.length; index += 1) {
    const criterion = displayCriteria[index];
    const rowY = tableTop - 28 - (index + 1) * rowHeight;
    currentPage.drawRectangle({ x: tableLeft, y: rowY, width: colFactor, height: rowHeight, borderColor: rgb(0.2, 0.2, 0.2), borderWidth: 1.0 });
    currentPage.drawRectangle({ x: colX.employee, y: rowY, width: colEmployee, height: rowHeight, borderColor: rgb(0.2, 0.2, 0.2), borderWidth: 1.0 });
    currentPage.drawRectangle({ x: colX.supervisor, y: rowY, width: colSupervisor, height: rowHeight, borderColor: rgb(0.2, 0.2, 0.2), borderWidth: 1.0 });
    currentPage.drawRectangle({ x: colX.reviewer, y: rowY, width: colReviewer, height: rowHeight, borderColor: rgb(0.2, 0.2, 0.2), borderWidth: 1.0 });

    const employeeRating = ratingMap.get(criterion.id)?.EMPLOYEE ?? "";
    const supervisorRating = ratingMap.get(criterion.id)?.SUPERVISOR ?? "";
    const reviewingRating = ratingMap.get(criterion.id)?.REVIEWING_SUPERVISOR ?? "";

    currentPage.drawText(`${criterion.letter}. ${criterion.title}`, {
      x: tableLeft + 8,
      y: rowY + 23,
      size: 8,
      font: bold,
      color: rgb(0.12, 0.16, 0.2),
      maxWidth: colFactor - 14,
    });
    currentPage.drawText(criterion.description, {
      x: tableLeft + 8,
      y: rowY + 8,
      size: 6.5,
      font,
      color: rgb(0.12, 0.16, 0.2),
      maxWidth: colFactor - 14,
    });
    currentPage.drawText(String(employeeRating), { x: colX.employee + 40, y: rowY + 16, size: 9, font: bold, color: rgb(0.12, 0.16, 0.2) });
    currentPage.drawText(String(supervisorRating), { x: colX.supervisor + 40, y: rowY + 16, size: 9, font: bold, color: rgb(0.12, 0.16, 0.2) });
    currentPage.drawText(String(reviewingRating), { x: colX.reviewer + 52, y: rowY + 16, size: 9, font: bold, color: rgb(0.12, 0.16, 0.2) });
  }

  const signatureY = 210;
  drawSignatureBlock({ x: 36, label: "APPRAISED BY:", name: raterName, title: raterTitle, date: stageSignatures.get("RATER_STEP2")?.signed_at ?? null, signature: raterSig, y: signatureY });
  drawSignatureBlock({ x: 216, label: "REVIEWED BY:", name: reviewingSupervisorName, title: reviewingSupervisorTitle, date: stageSignatures.get("REVIEWING_SUPERVISOR_STEP3")?.signed_at ?? null, signature: reviewingSupervisorSig, y: signatureY });
  drawSignatureBlock({ x: 396, label: "REVIEWED WITH ME:", name: employeeName, title: employeeJobTitle, date: employeeSignatureDate, signature: employeeSig, y: signatureY });

  currentPage = addPage();
  currentY = 760;

  drawTextLine("CONCLUSIONS AND COMMENTS", 118, 760, 12, bold);
  drawTextLine("(CONFIDENTIAL: NOT TO BE SHOWN TO RATEE)", 134, 744, 9, bold);
  drawTextLine("STEP TWO: DEVELOP CONCLUSION AND COMMENTS", 36, 720, 11, bold);

  const stepTwoItems = [
    { label: "If the overall rating is excellent or poor, explain why the employee was rated such or support rating with specific incidents.", value: evaluation.supervisor_step2_overall_explanation ?? "" },
    { label: "Principal Strengths:", value: evaluation.supervisor_step2_strengths ?? "" },
    { label: "Principal Weaknesses:", value: evaluation.supervisor_step2_weaknesses ?? "" },
    { label: "To be more effective on present job the employee should:", value: evaluation.supervisor_step2_development ?? "" },
    { label: "Development Potential:", value: evaluation.supervisor_step2_development_potential ?? "" },
    { label: "Advancement Outlook:", value: evaluation.supervisor_step2_advancement_outlook ?? "" },
    { label: "Suggestions to accelerate employee growth and development:", value: evaluation.supervisor_step2_growth_suggestions ?? "" },
    { label: "Job / transfer interest:", value: evaluation.supervisor_step2_transfer_interest ?? "" },
    { label: "Transfer / job / where / qualification details:", value: `${evaluation.supervisor_step2_transfer_job ?? ""} ${evaluation.supervisor_step2_transfer_where ?? ""} ${evaluation.supervisor_step2_transfer_qualified ?? ""}`.trim() },
    { label: "Other comments and recommendations:", value: evaluation.supervisor_step2_other_comments ?? "" },
  ];

  for (const item of stepTwoItems) {
    ensureSpace(42);
    currentPage.drawText(item.label, { x: 36, y: currentY, size: 9, font: bold, color: rgb(0.12, 0.16, 0.2), maxWidth: 500 });
    currentY -= 18;
    if (item.value) {
      const answerLines = wrapText(item.value, 90);
      answerLines.slice(0, 5).forEach((line) => {
        currentPage.drawText(line, { x: 42, y: currentY, size: 8, font, color: rgb(0.12, 0.16, 0.2), maxWidth: 500 });
        currentY -= 14;
      });
    }
    currentY -= 12;
  }

  if (raterSig || raterName) {
    ensureSpace(64);
    currentPage.drawLine({ start: { x: 40, y: currentY }, end: { x: 250, y: currentY }, thickness: 0.8, color: rgb(0.18, 0.18, 0.18) });
    currentPage.drawText("Signature of Rater", { x: 40, y: currentY + 8, size: 8, font: bold });
    if (raterSig) {
      currentPage.drawImage(raterSig as never, { x: 40, y: currentY + 20, width: 145, height: 34 });
    }
    currentPage.drawText(raterName || "—", { x: 40, y: currentY + 56, size: 9, font, color: rgb(0.12, 0.16, 0.2) });
    currentPage.drawText(raterTitle || "Rater / Immediate Supervisor", { x: 40, y: currentY + 42, size: 8, font, color: rgb(0.12, 0.16, 0.2) });
    currentPage.drawText(`Date: ${stageSignatures.get("RATER_STEP2")?.signed_at ? formatDate(stageSignatures.get("RATER_STEP2")!.signed_at) : "—"}`, { x: 40, y: currentY + 28, size: 8, font });
  }

  currentPage = addPage();
  currentY = 760;
  drawTextLine("STEP THREE: REVIEWED BY THE REVIEWING SUPERVISOR", 36, 760, 11, bold);
  drawTextLine("COMMENTS AND RECOMMENDATIONS OF", 156, 744, 10, bold);
  drawTextLine("REVIEWING SUPERVISOR / DIVISION HEAD", 150, 730, 10, bold);

  const stepThreeText = [step3Result?.data?.comments ?? "", step3Result?.data?.recommendations ?? ""].filter(Boolean).join("\n\n");
  if (stepThreeText) {
    ensureSpace(120);
    const lines = wrapText(stepThreeText, 92);
    lines.slice(0, 18).forEach((line) => {
      currentPage.drawText(line, { x: 36, y: currentY, size: 9, font, color: rgb(0.12, 0.16, 0.2), maxWidth: 520 });
      currentY -= 14;
    });
  }

  ensureSpace(96);
  if (reviewingSupervisorSig || reviewingSupervisorName) {
    currentPage.drawLine({ start: { x: 40, y: currentY }, end: { x: 250, y: currentY }, thickness: 0.8, color: rgb(0.18, 0.18, 0.18) });
    currentPage.drawText("Signature of Reviewing Supervisor / Division Head", { x: 40, y: currentY + 8, size: 8, font: bold });
    if (reviewingSupervisorSig) {
      currentPage.drawImage(reviewingSupervisorSig as never, { x: 40, y: currentY + 20, width: 145, height: 34 });
    }
    currentPage.drawText(reviewingSupervisorName || "—", { x: 40, y: currentY + 56, size: 9, font, color: rgb(0.12, 0.16, 0.2) });
    currentPage.drawText(reviewingSupervisorTitle || "Reviewing Supervisor / Division Head", { x: 40, y: currentY + 42, size: 8, font, color: rgb(0.12, 0.16, 0.2) });
    currentPage.drawText(`Date: ${stageSignatures.get("REVIEWING_SUPERVISOR_STEP3")?.signed_at ? formatDate(stageSignatures.get("REVIEWING_SUPERVISOR_STEP3")!.signed_at) : "—"}`, { x: 40, y: currentY + 28, size: 8, font });
  }

  currentPage = addPage();
  currentY = 760;
  drawTextLine("TO BE FILLED UP BY THE PERSONNEL OFFICE", 150, 760, 12, bold);
  drawField({ label: "Employee's Present Salary:", value: personnelResult?.data?.present_salary ?? "", labelX: 36, valueX: 198, valueWidth: 330, y: 728 });
  drawField({ label: "Date of Last Increase:", value: personnelResult?.data?.last_increase_date ?? "", labelX: 36, valueX: 190, valueWidth: 330, y: 706 });
  drawField({ label: "Nature of Last Increase:", value: personnelResult?.data?.last_increase_nature ?? "", labelX: 36, valueX: 190, valueWidth: 330, y: 684 });
  drawField({ label: "Amount of Last Increase:", value: personnelResult?.data?.last_increase_amount ?? "", labelX: 36, valueX: 196, valueWidth: 320, y: 662 });

  drawField({ label: "TOTAL POINTS:", value: scoreResult?.data?.final_score ?? "", labelX: 36, valueX: 146, valueWidth: 120, y: 620 });
  drawField({ label: "ADJECTIVE RATING:", value: scoreResult?.data?.final_rating_label ?? "", labelX: 260, valueX: 408, valueWidth: 120, y: 620 });
  drawField({ label: "Recommended Increase / Bonus:", value: personnelResult?.data?.recommended_increase_bonus ?? "", labelX: 36, valueX: 240, valueWidth: 300, y: 590 });

  currentPage = addPage();
  currentY = 760;
  drawTextLine("COMMITTEE REVIEW", 220, 760, 12, bold);
  drawTextLine("Final action:", 36, 730, 10, bold);
  currentPage.drawText(normalizeText(committeeResult?.data?.final_action) || "—", { x: 120, y: 730, size: 9, font, maxWidth: 430 });
  drawTextLine("Action Details:", 36, 708, 10, bold);
  currentPage.drawText(normalizeText(committeeResult?.data?.action_details) || "—", { x: 120, y: 708, size: 9, font, maxWidth: 430 });
  drawTextLine("Recommendation:", 36, 686, 10, bold);
  currentPage.drawText(normalizeText(committeeResult?.data?.recommendation) || "—", { x: 130, y: 686, size: 9, font, maxWidth: 430 });

  drawTextLine("PRESIDENT APPROVAL", 220, 640, 12, bold);
  drawTextLine("Final Decision:", 36, 610, 10, bold);
  currentPage.drawText(normalizeText(finalizationReason) || "—", { x: 140, y: 610, size: 9, font, maxWidth: 420 });
  drawTextLine("Approved By:", 36, 560, 10, bold);
  currentPage.drawText(presidentName || "—", { x: 120, y: 560, size: 10, font, maxWidth: 220 });
  currentPage.drawText(statusLabel, { x: 360, y: 560, size: 10, font: bold, maxWidth: 180 });
  currentPage.drawText(`Date approved: ${finalizedAt ? formatDate(finalizedAt) : "—"}`, { x: 36, y: 540, size: 9, font });

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
