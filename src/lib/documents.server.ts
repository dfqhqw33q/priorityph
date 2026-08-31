import { getAdmin, validationError } from "./server-core.server";

/**
 * Generate HTML string for the Performance Evaluation Sheet
 * Matches the responsive React component design
 */
export function generateEvaluationHTML(params: {
  companyName: string;
  companyAddress: string;
  periodFrom: string;
  periodTo: string;
  nameOfRatee: string;
  jobTitleOfRatee: string;
  division: string;
  sectionUnit: string;
  nameOfRater: string;
  jobTitleOfRater: string;
  factors: Array<{
    letter: string;
    title: string;
    description: string;
    employeeSelfRating: number | string;
    supervisorRating: number | string;
    reviewingSupervisorRating: number | string;
  }>;
  appraisedByName: string;
  appraisedByTitle: string;
  appraisedByDate: string;
  reviewedByName: string;
  reviewedByTitle: string;
  reviewedByDate: string;
  reviewedWithMeName: string;
  reviewedWithMeTitle: string;
  reviewedWithMeDate: string;
  overallRatingExplanation: string;
  principalStrengths: string;
  principalWeakness: string;
  effectivenessRecommendation: string;
}): string {
  const factorRows = params.factors
    .map(
      (f) => `
    <tr>
      <td style="border: 1px solid #000; padding: 12px; vertical-align: top; font-size: 12px;">
        <div style="display: flex; gap: 8px;">
          <span style="font-weight: bold; white-space: nowrap;">${f.letter}.</span>
          <div>
            <span style="font-weight: bold; text-transform: uppercase;">${f.title}.</span>
            <span>${f.description}</span>
          </div>
        </div>
      </td>
      <td style="border: 1px solid #000; padding: 12px; text-align: center; font-weight: bold; font-size: 18px; vertical-align: middle;">
        ${f.employeeSelfRating}
      </td>
      <td style="border: 1px solid #000; padding: 12px; text-align: center; font-weight: bold; font-size: 18px; vertical-align: middle;">
        ${f.supervisorRating}
      </td>
      <td style="border: 1px solid #000; padding: 12px; text-align: center; font-weight: bold; font-size: 18px; vertical-align: middle;">
        ${f.reviewingSupervisorRating}
      </td>
    </tr>
  `,
    )
    .join("");

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Performance Evaluation Sheet</title>
  <style>
    @media print {
      * { margin: 0; padding: 0; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      html, body { margin: 0; padding: 0; background: white; height: auto; width: 100%; }
      @page { size: A4 portrait; margin: 0.5in; orphans: 3; widows: 3; }
      body { font-family: Arial, sans-serif; font-size: 12px; }
    }
    * { box-sizing: border-box; }
    body { font-family: Arial, sans-serif; color: #1a1a1a; background: white; margin: 0; padding: 20px; }
    .container { max-width: 8.5in; margin: 0 auto; background: white; }
    .header { margin-bottom: 20px; }
    .company-name { text-align: center; font-size: 18px; font-weight: bold; text-transform: uppercase; margin-bottom: 4px; }
    .company-address { text-align: center; font-size: 11px; margin-bottom: 16px; }
    .title { text-align: center; margin: 16px 0; }
    .title h1 { font-size: 16px; font-weight: bold; text-transform: uppercase; margin: 0; }
    .title h2 { font-size: 14px; font-weight: bold; text-transform: uppercase; margin: 4px 0 0 0; }
    
    .period-covered { display: flex; align-items: center; gap: 8px; margin-bottom: 12px; flex-wrap: wrap; }
    .period-covered span { font-size: 11px; font-weight: 600; white-space: nowrap; }
    .period-covered .input { flex: 1; min-width: 120px; border: none; border-bottom: 1px solid #000; text-align: center; font-size: 12px; padding: 4px 8px; }
    
    .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px 16px; margin-bottom: 12px; }
    .info-field { display: flex; align-items: center; gap: 8px; }
    .info-field label { font-size: 11px; font-weight: 600; text-transform: uppercase; white-space: nowrap; }
    .info-field .value { flex: 1; border: none; border-bottom: 1px solid #000; font-size: 12px; padding: 4px 8px; word-wrap: break-word; }
    
    .rating-scale { border: 1px solid #000; padding: 8px; margin-bottom: 12px; display: flex; flex-wrap: wrap; justify-content: space-between; gap: 8px; font-weight: 600; font-size: 11px; }
    
    .table-container { margin-bottom: 12px; }
    table { width: 100%; border-collapse: collapse; font-size: 12px; }
    thead tr { background-color: #d4d4d4; }
    th { border: 1px solid #000; padding: 8px; text-align: center; font-weight: bold; text-transform: uppercase; font-size: 11px; }
    th:nth-child(2) { background-color: #dce8ff; }
    th:nth-child(3) { background-color: #dff3df; }
    th:nth-child(4) { background-color: #f9e8cf; }
    
    .signatures { border-top: 1px solid #000; border-bottom: 1px solid #000; display: flex; margin-bottom: 12px; }
    .sig-block { flex: 1; padding: 12px; border-left: 1px solid #000; text-align: center; }
    .sig-block:first-child { border-left: none; }
    .sig-block h3 { font-size: 11px; font-weight: bold; text-transform: uppercase; margin: 0 0 12px 0; }
    .sig-line { min-height: 40px; border-bottom: 2px solid #000; margin-bottom: 8px; }
    .sig-name { font-size: 11px; font-weight: bold; margin-bottom: 2px; }
    .sig-title { font-size: 10px; margin-bottom: 8px; }
    .sig-date { font-size: 10px; }
    
    .conclusions { border-top: 1px solid #000; padding-top: 12px; }
    .conclusions h3 { text-align: center; font-size: 12px; font-weight: bold; text-transform: uppercase; margin-bottom: 8px; }
    .conclusions h4 { font-size: 12px; font-weight: bold; margin: 8px 0; }
    .conclusions p { font-size: 12px; margin: 4px 0; }
    .conclusions .question { margin-bottom: 8px; }
    .question-content { border: none; border-bottom: 1px solid #000; min-height: 24px; padding: 4px 8px; font-size: 12px; margin-bottom: 8px; word-wrap: break-word; }
    .flex-row { display: flex; gap: 8px; margin-bottom: 8px; }
    .flex-row label { font-weight: 600; font-size: 12px; white-space: nowrap; }
    .flex-row .value { flex: 1; border: none; border-bottom: 1px solid #000; font-size: 12px; padding: 4px 8px; }
    
    @media print {
      .container { max-width: 100%; padding: 0; }
      body { margin: 0; padding: 0; }
      .info-field .value, .period-covered .input { page-break-inside: avoid; }
      table { page-break-inside: auto; }
      tr { page-break-inside: avoid; break-inside: avoid; }
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <div class="company-name">${params.companyName}</div>
      <div class="company-address">${params.companyAddress}</div>
      <div class="title">
        <h1>Performance Evaluation Sheet</h1>
        <h2>For Non-Supervisory Staff</h2>
      </div>
    </div>
    
    <div class="period-covered">
      <span>Period Covered:</span>
      <span>FROM</span>
      <div class="input" style="max-width: 150px;">${params.periodFrom}</div>
      <span>TO</span>
      <div class="input" style="max-width: 150px;">${params.periodTo}</div>
    </div>
    
    <div class="info-grid">
      <div class="info-field">
        <label>NAME OF RATEE:</label>
        <div class="value">${params.nameOfRatee || " "}</div>
      </div>
      <div class="info-field">
        <label>JOB TITLE OF RATEE:</label>
        <div class="value">${params.jobTitleOfRatee || " "}</div>
      </div>
      <div class="info-field">
        <label>DIVISION/DEPT:</label>
        <div class="value">${params.division || " "}</div>
      </div>
      <div class="info-field">
        <label>SECTION/UNIT:</label>
        <div class="value">${params.sectionUnit || " "}</div>
      </div>
      <div class="info-field">
        <label>NAME OF RATER:</label>
        <div class="value">${params.nameOfRater || " "}</div>
      </div>
      <div class="info-field">
        <label>JOB TITLE OF RATER:</label>
        <div class="value">${params.jobTitleOfRater || " "}</div>
      </div>
    </div>
    
    <div class="rating-scale">
      <span>RATING:</span>
      <span>1 - Poor</span>
      <span>2 - Below Average</span>
      <span>3 - Average</span>
      <span>4 - Above Average</span>
      <span>5 - Excellent</span>
    </div>
    
    <div class="table-container">
      <table>
        <thead>
          <tr>
            <th style="width: 55%; text-align: left;">Performance Evaluation Factor</th>
            <th>Employee / Ratee<br><span style="font-size: 10px; font-weight: normal;">(Self Rating)</span></th>
            <th>Supervisor / Rater<br><span style="font-size: 10px; font-weight: normal;">(Rating)</span></th>
            <th>Reviewing Supervisor /<br>Division Head<br><span style="font-size: 10px; font-weight: normal;">(Rating)</span></th>
          </tr>
        </thead>
        <tbody>
          ${factorRows}
        </tbody>
      </table>
    </div>
    
    <div class="signatures">
      <div class="sig-block">
        <h3>Appraised By:</h3>
        <div class="sig-line"></div>
        <div class="sig-name">${params.appraisedByName || "—"}</div>
        <div class="sig-title">${params.appraisedByTitle || "—"}</div>
        <div class="sig-date">Date: <span>${params.appraisedByDate || "—"}</span></div>
      </div>
      <div class="sig-block">
        <h3>Reviewed By:</h3>
        <div class="sig-line"></div>
        <div class="sig-name">${params.reviewedByName || "—"}</div>
        <div class="sig-title">${params.reviewedByTitle || "—"}</div>
        <div class="sig-date">Date: <span>${params.reviewedByDate || "—"}</span></div>
      </div>
      <div class="sig-block">
        <h3>Reviewed With Me:</h3>
        <div class="sig-line"></div>
        <div class="sig-name">${params.reviewedWithMeName || "—"}</div>
        <div class="sig-title">${params.reviewedWithMeTitle || "—"}</div>
        <div class="sig-date">Date: <span>${params.reviewedWithMeDate || "—"}</span></div>
      </div>
    </div>
    
    <div class="conclusions">
      <h3>Conclusions and Comments (Confidential: Not to be Shown to Ratee)</h3>
      <h4>Step Two: Develop conclusion and comments</h4>
      
      <div class="question">
        <p>1. If the overall rating is excellent or poor, explain why the employee was rated such or support rating with specific incidents.</p>
        <div class="question-content">${params.overallRatingExplanation}</div>
        <div class="question-content"></div>
      </div>
      
      <div class="question">
        <p>2. Summarize the principal strengths and weakness of the employee.</p>
        <div class="flex-row">
          <label>Principal Strengths:</label>
          <div class="value">${params.principalStrengths}</div>
        </div>
        <div class="flex-row">
          <label>Principal Weakness:</label>
          <div class="value">${params.principalWeakness}</div>
        </div>
        <div class="flex-row">
          <label>To be more effective on present job the employee should:</label>
          <div class="value">${params.effectivenessRecommendation}</div>
        </div>
      </div>
    </div>
  </div>
</body>
</html>`;
}

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

/**
 * Generate evaluation sheet data for rendering
 * Returns structured data that can be used by React component or HTML template
 */
export async function generateEvaluationData(evaluationId: string) {
  const admin = await getAdmin();

  try {
    // Fetch evaluation with its cycle
    const { data: evaluation, error: evalError } = (await admin
      .from("evaluations")
      .select(
        "id, version, employee_id, employee_number_snapshot, full_name_snapshot, job_title_snapshot, division_snapshot, section_snapshot, status, finalized_at, finalized_by, finalization_reason, supervisor_user_id, supervisor_submitted_at, supervisor_step2_strengths, supervisor_step2_weaknesses, supervisor_step2_development, supervisor_step2_advancement, supervisor_step2_career_transfer, supervisor_step2_recommendations, supervisor_step2_overall_explanation, supervisor_step2_effectiveness, supervisor_step2_development_potential, supervisor_step2_advancement_outlook, supervisor_step2_growth_suggestions, supervisor_step2_transfer_interest, supervisor_step2_transfer_job, supervisor_step2_transfer_where, supervisor_step2_transfer_qualified, supervisor_step2_other_comments, supervisor_step2_date, supervisor_remarks, cycle_id, evaluation_cycles(name, year, starts_at, ends_at, template_id)",
      )
      .eq("id", evaluationId)
      .maybeSingle()) as any;

    console.log(`[generateEvaluationData] Main query - evaluation found: ${!!evaluation}, error: ${evalError?.message}`);

    if (evalError) throw new Error(`Failed to fetch evaluation: ${evalError.message}`);
    if (!evaluation) throw new Error(`Evaluation not found for ID: ${evaluationId}`);

    console.log(`[generateEvaluationData] Evaluation loaded, processing relationships...`);

    const cycle = (evaluation as never as { evaluation_cycles: { name: string; year: number; starts_at: string; ends_at: string; template_id: string } }).evaluation_cycles;

    // First batch of queries
    const [criteriaResult, ratingsResult, stageSignatureResult, employeeRecordResult] = await Promise.all([
      admin.from("evaluation_criteria").select("id, letter, title, description, position").eq("template_id", cycle.template_id).order("position"),
      admin.from("evaluation_ratings").select("criterion_id, evaluator_type, rating").eq("evaluation_id", evaluationId),
      admin.from("evaluation_stage_signatures").select("stage, signed_at").eq("evaluation_id", evaluationId),
      evaluation.employee_id ? admin.from("employees").select("full_name, job_title").eq("id", evaluation.employee_id).maybeSingle() : Promise.resolve({ data: null }),
    ]);

    console.log(`[generateEvaluationData] Criteria: ${criteriaResult.data?.length || 0}, Ratings: ${ratingsResult.data?.length || 0}, Signatures: ${stageSignatureResult.data?.length || 0}, Employee: ${!!employeeRecordResult?.data}`);

    // Get reviewing supervisor info
    const { data: step3Result } = (await admin.from("reviewing_supervisor_reviews").select("reviewer_user_id").eq("evaluation_id", evaluationId).maybeSingle()) as any;

    // Fetch internal users that we need
    const userIds = [evaluation.supervisor_user_id, step3Result?.reviewer_user_id].filter((id): id is string => Boolean(id));
    const { data: userListResult } = userIds.length ? await admin.from("internal_users").select("id, full_name, job_title").in("id", userIds) : ({ data: [] } as any);

    const ratingMap = new Map<string, Record<string, number | undefined>>();
    for (const row of ratingsResult.data ?? []) {
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

    const criteriaByLetter = new Map((criteriaResult.data ?? []).map((criterion) => [criterion.letter, criterion]));
    const displayCriteria = officialFactorDefinitions.map((factor) => {
      const persisted = criteriaByLetter.get(factor.letter);
      return {
        ...factor,
        id: persisted?.id ?? factor.letter,
        description: persisted?.description?.trim() || factor.description,
        title: persisted?.title?.trim() || factor.title,
      };
    });

    const userLookup = new Map((userListResult ?? []).map((user) => [user.id, { full_name: user.full_name, job_title: user.job_title ?? null }]));
    const raterUser = evaluation.supervisor_user_id ? userLookup.get(evaluation.supervisor_user_id) ?? null : null;
    const reviewingSupervisorUser = step3Result?.reviewer_user_id ? userLookup.get(step3Result.reviewer_user_id) ?? null : null;
    const employeeName = employeeRecordResult?.data?.full_name ?? evaluation.full_name_snapshot ?? "—";
    const employeeJobTitle = employeeRecordResult?.data?.job_title ?? evaluation.job_title_snapshot ?? "Ratee / Employee";
    const raterName = raterUser?.full_name ?? "—";
    const raterTitle = raterUser?.job_title ?? "Rater / Immediate Supervisor";
    const reviewingSupervisorName = reviewingSupervisorUser?.full_name ?? "—";
    const reviewingSupervisorTitle = reviewingSupervisorUser?.job_title ?? "Reviewing Supervisor / Division Head";
    const periodFrom = formatFormDate(cycle.starts_at) || `January 1, ${cycle.year}`;
    const periodTo = formatFormDate(cycle.ends_at) || `December 31, ${cycle.year}`;

    return {
      companyName: "PRIORITY HANDLING LOGISTICS, INC.",
      companyAddress: "1618-B Copernico St., San Isidro, Makati City",
      periodFrom,
      periodTo,
      nameOfRatee: evaluation.full_name_snapshot || employeeName,
      jobTitleOfRatee: evaluation.job_title_snapshot || employeeJobTitle,
      division: evaluation.division_snapshot || "—",
      sectionUnit: evaluation.section_snapshot || "—",
      nameOfRater: raterName,
      jobTitleOfRater: raterTitle,
      factors: displayCriteria.map((c) => ({
        letter: c.letter,
        title: c.title,
        description: c.description,
        employeeSelfRating: ratingMap.get(c.id)?.["EMPLOYEE"] || "",
        supervisorRating: ratingMap.get(c.id)?.["SUPERVISOR"] || "",
        reviewingSupervisorRating: ratingMap.get(c.id)?.["REVIEWING_SUPERVISOR"] || "",
      })),
      appraisedByName: raterName,
      appraisedByTitle: raterTitle,
      appraisedByDate: formatDate((stageSignatureResult.data ?? []).find((s) => s.stage === "RATER_STEP2")?.signed_at),
      reviewedByName: reviewingSupervisorName,
      reviewedByTitle: reviewingSupervisorTitle,
      reviewedByDate: formatDate((stageSignatureResult.data ?? []).find((s) => s.stage === "REVIEWING_SUPERVISOR_STEP3")?.signed_at),
      reviewedWithMeName: employeeName,
      reviewedWithMeTitle: employeeJobTitle,
      reviewedWithMeDate: "—",
      overallRatingExplanation: normalizeText(evaluation.supervisor_step2_overall_explanation) || "",
      principalStrengths: normalizeText(evaluation.supervisor_step2_strengths) || "",
      principalWeakness: normalizeText(evaluation.supervisor_step2_weaknesses) || "",
      effectivenessRecommendation: normalizeText(evaluation.supervisor_step2_development) || "",
    };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error(`[generateEvaluationData] Error:`, errorMsg, error);
    throw new Error(`Error generating evaluation data: ${errorMsg}`);
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
    .select("id, version, employee_id, cycle_id, evaluation_cycles(name, year)")
    .eq("id", evaluationId)
    .maybeSingle();
  if (!evaluation) throw new Error("Evaluation not found");

  const cycle = (evaluation as never as { evaluation_cycles: { name: string; year: number } }).evaluation_cycles;

  // Check if document record already exists
  const existingDocument = await admin
    .from("employee_documents")
    .select("id, evaluation_version")
    .eq("evaluation_id", evaluationId)
    .eq("category", "PERFORMANCE_EVALUATIONS")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  // Skip if already created for this version (unless forceRefresh)
  if (!options.forceRefresh && existingDocument.data && (existingDocument.data.evaluation_version ?? evaluation.version) === evaluation.version) {
    return existingDocument.data;
  }

  // Create or update document record (HTML is generated on-demand via getEvaluationSheetHtml)
  const payload = {
    employee_id: evaluation.employee_id,
    evaluation_id: evaluationId,
    evaluation_version: evaluation.version,
    category: "PERFORMANCE_EVALUATIONS",
    file_name: `${cycle.year} Final Performance Evaluation v${evaluation.version}`,
    storage_path: `evaluations/${evaluationId}/finalized`, // Virtual path for reference
    content_type: "text/html",
    file_size: 0, // Generated on-demand
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
