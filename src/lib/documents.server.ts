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
  forceRefresh?: boolean;
};

export async function ensureFinalizedEvaluationDocument(evaluationId: string, actorUserId: string, forceRefresh = false) {
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
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!forceRefresh && existing && (existing.evaluation_version ?? evaluation.version) === evaluation.version) {
    return existing;
  }
  return createFinalEvaluationDocument(evaluationId, actorUserId, {
    statusOverride: "FINALIZED",
    finalizedAt: new Date().toISOString(),
    forceRefresh,
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
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!options.forceRefresh && existingDocument.data && (existingDocument.data.evaluation_version ?? evaluation.version) === evaluation.version) {
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
  const page = pdf.addPage([612, 792]);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);

  const drawText = (text: string, x: number, y: number, size = 9, weight: typeof font = font, color = rgb(0.1, 0.1, 0.1), maxWidth?: number) => {
    page.drawText(String(text ?? ""), { x, y, size, font: weight, color, maxWidth });
  };

  const drawLine = (x1: number, y1: number, x2: number, y2: number, thickness = 0.8, color = rgb(0.16, 0.16, 0.16)) => {
    page.drawLine({ start: { x: x1, y: y1 }, end: { x: x2, y: y2 }, thickness, color });
  };

  const drawFilledCell = ({ x, y, width, height, fillColor, borderColor, borderWidth = 1 }: { x: number; y: number; width: number; height: number; fillColor?: ReturnType<typeof rgb>; borderColor?: ReturnType<typeof rgb>; borderWidth?: number }) => {
    page.drawRectangle({
      x,
      y,
      width,
      height,
      borderColor: borderColor ?? rgb(0.12, 0.12, 0.12),
      borderWidth,
      fillColor,
    });
  };

  const employeeSignature = employeeSignatureResult?.data ?? null;
  const employeeSignatureDate = employeeSignature?.signed_at ?? null;
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
  const employeeName = employeeRecordResult?.data?.full_name ?? evaluation.full_name_snapshot ?? "—";
  const employeeJobTitle = employeeRecordResult?.data?.job_title ?? evaluation.job_title_snapshot ?? "Ratee / Employee";
  const raterName = raterUser?.full_name ?? "—";
  const raterTitle = raterUser?.job_title ?? "Rater / Immediate Supervisor";
  const reviewingSupervisorName = reviewingSupervisorUser?.full_name ?? "—";
  const reviewingSupervisorTitle = reviewingSupervisorUser?.job_title ?? "Reviewing Supervisor / Division Head";
  const periodFrom = cycle.starts_at ? formatFormDate(cycle.starts_at) : `January 1, ${cycle.year}`;
  const periodTo = cycle.ends_at ? formatFormDate(cycle.ends_at) : `December 31, ${cycle.year}`;

  const tableLeft = 36;
  const tableWidth = 540;
  const factorWidth = 318;
  const ratingWidth = 75;
  const rowHeight = 42;

  drawText("PRIORITY HANDLING LOGISTICS, INC.", 148, 760, 15, bold);
  drawText("1618-B Copernico St., San Isidro, Makati City", 164, 744, 8.5, font);
  drawText("PERFORMANCE EVALUATION SHEET", 170, 716, 15, bold);
  drawText("FOR NON-SUPERVISORY STAFF", 188, 700, 10, bold);

  drawText("PERIOD COVERED:", 36, 675, 9, bold);
  drawText("FROM", 142, 675, 8, font);
  drawText(periodFrom, 170, 675, 8, font);
  drawText("TO", 336, 675, 8, font);
  drawText(periodTo, 356, 675, 8, font);

  drawText("NAME OF RATEE:", 36, 650, 9, bold);
  drawText(normalizeText(evaluation.full_name_snapshot ?? employeeName) || "—", 126, 650, 8, font, rgb(0.1, 0.1, 0.1), 146);
  drawText("JOB TITLE OF RATEE:", 334, 650, 9, bold);
  drawText(normalizeText(evaluation.job_title_snapshot ?? employeeJobTitle) || "—", 460, 650, 8, font, rgb(0.1, 0.1, 0.1), 110);

  drawText("DIVISION / DEPT:", 36, 625, 9, bold);
  drawText(normalizeText(evaluation.division_snapshot) || "—", 132, 625, 8, font, rgb(0.1, 0.1, 0.1), 160);
  drawText("SECTION / UNIT:", 334, 625, 9, bold);
  drawText(normalizeText(evaluation.section_snapshot) || "—", 448, 625, 8, font, rgb(0.1, 0.1, 0.1), 110);

  drawText("NAME OF RATER:", 36, 600, 9, bold);
  drawText(normalizeText(raterName) || "—", 126, 600, 8, font, rgb(0.1, 0.1, 0.1), 150);
  drawText("JOB TITLE OF RATER:", 334, 600, 9, bold);
  drawText(normalizeText(raterTitle) || "—", 460, 600, 8, font, rgb(0.1, 0.1, 0.1), 110);

  drawText("RATING:", 36, 578, 9, bold);
  drawText("1 - Poor", 84, 578, 8, font);
  drawText("2 - Below Average", 146, 578, 8, font);
  drawText("3 - Average", 248, 578, 8, font);
  drawText("4 - Above Average", 310, 578, 8, font);
  drawText("5 - Excellent", 404, 578, 8, font);

  const tableTop = 520;
  const factorColX = tableLeft;
  const ratingColX = tableLeft + factorWidth;
  const value1X = ratingColX;
  const value2X = ratingColX + ratingWidth;
  const value3X = ratingColX + (ratingWidth * 2);

  drawFilledCell({ x: tableLeft, y: tableTop - 24, width: tableWidth, height: 320, borderColor: rgb(0.12, 0.12, 0.12), borderWidth: 1.0 });
  drawFilledCell({ x: factorColX, y: tableTop - 24, width: factorWidth, height: 24, fillColor: rgb(0.86, 0.86, 0.86), borderColor: rgb(0.12, 0.12, 0.12), borderWidth: 1.0 });
  drawFilledCell({ x: value1X, y: tableTop - 24, width: ratingWidth, height: 24, fillColor: rgb(0.86, 0.91, 1), borderColor: rgb(0.12, 0.12, 0.12), borderWidth: 1.0 });
  drawFilledCell({ x: value2X, y: tableTop - 24, width: ratingWidth, height: 24, fillColor: rgb(0.87, 0.96, 0.90), borderColor: rgb(0.12, 0.12, 0.12), borderWidth: 1.0 });
  drawFilledCell({ x: value3X, y: tableTop - 24, width: ratingWidth + 15, height: 24, fillColor: rgb(0.98, 0.91, 0.82), borderColor: rgb(0.12, 0.12, 0.12), borderWidth: 1.0 });

  drawText("PERFORMANCE EVALUATION FACTOR", tableLeft + 8, tableTop - 10, 9, bold);
  drawText("EMPLOYEE / RATEE", value1X + 8, tableTop - 10, 7.5, bold);
  drawText("SUPERVISOR / RATER", value2X + 8, tableTop - 10, 7.5, bold);
  drawText("REVIEWING SUPERVISOR /", value3X + 8, tableTop - 10, 7.2, bold);
  drawText("DIVISION HEAD", value3X + 16, tableTop - 19, 7.2, bold);

  for (let index = 0; index < displayCriteria.length; index += 1) {
    const criterion = displayCriteria[index];
    const rowY = tableTop - 24 - (index + 1) * rowHeight;
    const employeeRating = String(ratingMap.get(criterion.id)?.EMPLOYEE ?? "");
    const supervisorRating = String(ratingMap.get(criterion.id)?.SUPERVISOR ?? "");
    const reviewingRating = String(ratingMap.get(criterion.id)?.REVIEWING_SUPERVISOR ?? "");

    drawFilledCell({ x: factorColX, y: rowY, width: factorWidth, height: rowHeight, borderColor: rgb(0.12, 0.12, 0.12), borderWidth: 1.0 });
    drawFilledCell({ x: value1X, y: rowY, width: ratingWidth, height: rowHeight, fillColor: rgb(0.86, 0.91, 1), borderColor: rgb(0.12, 0.12, 0.12), borderWidth: 1.0 });
    drawFilledCell({ x: value2X, y: rowY, width: ratingWidth, height: rowHeight, fillColor: rgb(0.87, 0.96, 0.90), borderColor: rgb(0.12, 0.12, 0.12), borderWidth: 1.0 });
    drawFilledCell({ x: value3X, y: rowY, width: ratingWidth + 15, height: rowHeight, fillColor: rgb(0.98, 0.91, 0.82), borderColor: rgb(0.12, 0.12, 0.12), borderWidth: 1.0 });

    drawText(`${criterion.letter}.`, factorColX + 8, rowY + 27, 9, bold);
    drawText(`${criterion.title}.`, factorColX + 22, rowY + 27, 7.2, bold);

    const descLines = wrapText(criterion.description, 52);
    descLines.slice(0, 2).forEach((line, lineIndex) => {
      drawText(line, factorColX + 8, rowY + 13 - (lineIndex * 8), 5.8, font, rgb(0.12, 0.12, 0.12), 180);
    });

    drawText(employeeRating || "", value1X + 29, rowY + 15, 12, bold);
    drawText(supervisorRating || "", value2X + 29, rowY + 15, 12, bold);
    drawText(reviewingRating || "", value3X + 29, rowY + 15, 12, bold);
  }

  const sigLineY = 141;
  drawText("APPRAISED BY:", 38, 168, 8.5, bold);
  drawText("Rater / Immediate Supervisor", 38, 158, 7.0, font);
  drawLine(38, sigLineY, 188, sigLineY, 0.9, rgb(0.15, 0.15, 0.15));
  if (raterSig) {
    page.drawImage(raterSig as never, { x: 48, y: 150, width: 115, height: 22 });
  }
  drawText(normalizeText(raterName) || "—", 48, 136, 8.5, font);
  drawText(normalizeText(raterTitle) || "—", 48, 125, 7.0, font);
  drawText("Date:", 38, 112, 7.2, bold);
  drawText(stageSignatures.get("RATER_STEP2")?.signed_at ? formatDate(stageSignatures.get("RATER_STEP2")!.signed_at) : "—", 68, 112, 7.2, font);

  drawText("REVIEWED BY:", 216, 168, 8.5, bold);
  drawText("Reviewing Supervisor / Division Head", 216, 158, 7.0, font);
  drawLine(216, sigLineY, 366, sigLineY, 0.9, rgb(0.15, 0.15, 0.15));
  if (reviewingSupervisorSig) {
    page.drawImage(reviewingSupervisorSig as never, { x: 226, y: 150, width: 115, height: 22 });
  }
  drawText(normalizeText(reviewingSupervisorName) || "—", 226, 136, 8.5, font);
  drawText(normalizeText(reviewingSupervisorTitle) || "—", 226, 125, 7.0, font);
  drawText("Date:", 216, 112, 7.2, bold);
  drawText(stageSignatures.get("REVIEWING_SUPERVISOR_STEP3")?.signed_at ? formatDate(stageSignatures.get("REVIEWING_SUPERVISOR_STEP3")!.signed_at) : "—", 246, 112, 7.2, font);

  drawText("REVIEWED WITH ME:", 396, 168, 8.5, bold);
  drawText("Ratee / Employee", 396, 158, 7.0, font);
  drawLine(396, sigLineY, 546, sigLineY, 0.9, rgb(0.15, 0.15, 0.15));
  if (employeeSig) {
    page.drawImage(employeeSig as never, { x: 406, y: 150, width: 115, height: 22 });
  }
  drawText(normalizeText(employeeName) || "—", 406, 136, 8.5, font);
  drawText(normalizeText(employeeJobTitle) || "—", 406, 125, 7.0, font);
  drawText("Date:", 396, 112, 7.2, bold);
  drawText(employeeSignatureDate ? formatDate(employeeSignatureDate) : "—", 426, 112, 7.2, font);

  drawText("CONCLUSIONS AND COMMENTS (CONFIDENTIAL: NOT TO BE SHOWN TO RATEE)", 156, 92, 8.5, bold);
  drawText("STEP TWO: Develop conclusion and comments", 36, 72, 9, bold);

  const comment1 = evaluation.supervisor_step2_overall_explanation ?? "";
  if (comment1) {
    drawText("1. If the overall rating is excellent or poor, explain why the employee was rated such or support rating with specific incidents.", 36, 60, 7.2, font, rgb(0.12, 0.12, 0.12), 510);
    const lines = wrapText(comment1, 110);
    lines.slice(0, 2).forEach((line, idx) => {
      drawText(line, 36, 48 - idx * 10, 7.0, font, rgb(0.12, 0.12, 0.12), 510);
    });
  }

  const strengths = evaluation.supervisor_step2_strengths ?? "";
  const weaknesses = evaluation.supervisor_step2_weaknesses ?? "";
  const recommendation = evaluation.supervisor_step2_development ?? "";

  drawText("2. Summarize the principal strengths and weaknesses of the employee.", 36, 30, 7.2, font, rgb(0.12, 0.12, 0.12), 510);
  drawText("Principal Strengths:", 36, 18, 7.2, font, rgb(0.12, 0.12, 0.12), 120);
  drawText(strengths || "", 138, 18, 7.0, font, rgb(0.12, 0.12, 0.12), 150);
  drawText("Principal Weakness:", 300, 18, 7.2, font, rgb(0.12, 0.12, 0.12), 120);
  drawText(weaknesses || "", 408, 18, 7.0, font, rgb(0.12, 0.12, 0.12), 150);
  drawText("To be more effective on present job the employee should:", 36, 8, 7.2, font, rgb(0.12, 0.12, 0.12), 220);
  drawText(recommendation || "", 272, 8, 7.0, font, rgb(0.12, 0.12, 0.12), 260);

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
