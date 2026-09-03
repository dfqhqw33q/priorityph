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
  appraisedBySignature?: string | undefined;
  reviewedByName: string;
  reviewedByTitle: string;
  reviewedByDate: string;
  reviewedBySignature?: string | undefined;
  reviewedWithMeName: string;
  reviewedWithMeTitle: string;
  reviewedWithMeDate: string;
  reviewedWithMeSignature?: string | undefined;
  overallRatingExplanation: string;
  principalStrengths: string;
  principalWeakness: string;
  effectivenessRecommendation: string;
  developmentPotential: string;
  advancementOutlook: string;
  growthSuggestions: string;
  transferInterest: string;
  transferJob: string;
  transferWhere: string;
  transferQualified: string;
  otherComments: string;
  stepThreeComments: string;
  stepThreeRecommendations: string;
  presentSalary: string;
  lastIncreaseDate: string;
  lastIncreaseNature: string;
  lastIncreaseAmount: string;
  totalPoints: string;
  adjectiveRating: string;
  recommendedIncreaseBonus: string;
  finalAction: string;
  finalActionDetails: string;
  committeeRecommendation: string;
  approvedByName: string;
  approvedByDate: string;
  formDate?: string;
}): string {
  const escapeHtml = (value: string) => value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#039;");
  const text = (value: string) => escapeHtml(value || "");
  const renderLines = (value: string, maxCharsPerLine = 105) => {
    const normalized = value.trim();
    if (!normalized) return "";
    return wrapText(normalized, maxCharsPerLine)
      .map((line) => `<div class="input-line">${escapeHtml(line)}</div>`)
      .join("");
  };
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

  const actionMarker = (action: string) => params.finalAction === action ? "✓" : " ";

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
    .company-name { text-align: left; font-size: 10px; font-weight: bold; text-transform: uppercase; margin-bottom: 2px; }
    .company-address { text-align: left; font-size: 9px; margin-bottom: 16px; color: #666; }
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
    thead tr { background-color: #080B3D; }
    th { border: 1px solid #000; padding: 8px; text-align: center; font-weight: bold; text-transform: uppercase; font-size: 11px; color: white; }
    th:nth-child(2) { background-color: #0000FE; }
    th:nth-child(3) { background-color: #0000FE; }
    th:nth-child(4) { background-color: #0000FE; }
    
    .signatures { border-top: 1px solid #000; border-bottom: 1px solid #000; display: flex; margin-bottom: 12px; }
    .sig-block { flex: 1; padding: 12px; border-left: 1px solid #000; text-align: center; }
    .sig-block:first-child { border-left: none; }
    .sig-block h3 { font-size: 11px; font-weight: bold; text-transform: uppercase; margin: 0 0 12px 0; }
    .sig-line { min-height: 40px; border-bottom: 2px solid #000; margin-bottom: 8px; display: flex; align-items: center; justify-content: center; }
    .sig-image { max-width: 100%; max-height: 40px; object-fit: contain; }
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
    .step-two { margin-top: 24px; font-family: Arial, sans-serif; font-size: 12px; line-height: 1.5; }
    .step-two-header { text-align: center; margin-bottom: 32px; }
    .step-two-header h1 { font-size: 20px; margin: 0 0 4px; text-transform: uppercase; }
    .step-two-header h2 { font-size: 18px; margin: 0; text-transform: uppercase; }
    .step-two-title { margin-bottom: 16px; }
    .step-two-section { display: flex; gap: 16px; margin-bottom: 24px; }
    .step-two-number { font-weight: bold; }
    .step-two-content { flex: 1; }
    .step-two-content p { margin: 0 0 8px; }
    .input-line { border-bottom: 1px solid #000; padding: 4px 8px; min-height: 24px; word-wrap: break-word; }
    .input-line + .input-line { margin-top: 8px; }
    .step-two-options { display: grid; gap: 8px; }
    .step-two-option { display: flex; align-items: flex-start; gap: 12px; }
    .step-two-option input, .step-two-transfer input { appearance: none; width: 13px; height: 13px; margin: 4px 0 0; border: 1.5px solid #000; border-radius: 50%; background: #fff; opacity: 1; flex: 0 0 auto; }
    .step-two-option input:checked, .step-two-transfer input:checked { background: radial-gradient(circle, #000 0 45%, #fff 48% 100%); }
    .step-two-transfer { display: flex; align-items: center; gap: 8px; margin-bottom: 12px; }
    .step-two-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 32px; }
    .step-two-footer { margin-top: 64px; display: flex; justify-content: flex-end; }
    .step-two-footer .sig-block { width: 256px; flex: 0 0 256px; padding: 12px; text-align: center; }
    .step-two-footer .sig-line { min-height: 40px; border-bottom: 2px solid #000; margin-bottom: 8px; display: flex; align-items: center; justify-content: center; }
    .step-two-footer .sig-image { max-width: 100%; max-height: 40px; object-fit: contain; }
    .step-two-footer .sig-name { font-size: 11px; font-weight: bold; margin-bottom: 2px; }
    .step-two-footer .sig-title { font-size: 10px; margin-bottom: 8px; }
    .step-two-date-block { width: 128px; padding: 12px; text-align: center; }
    .step-two-date-line { height: 40px; border-bottom: 1px solid #000; display: flex; align-items: flex-end; justify-content: center; font-size: 10px; }
    .step-two-footer-label { margin-top: 4px; font-size: 10px; }
    @media (max-width: 700px) { .step-two-grid { grid-template-columns: 1fr; } .step-two-footer { justify-content: flex-start; } }

    .step-three { margin-top: 24px; font-family: Arial, sans-serif; font-size: 12px; line-height: 1.35; }
    .step-three h2, .step-three h3 { font-weight: bold; text-transform: uppercase; }
    .step-three-header { margin-bottom: 24px; }
    .step-three-comments { margin-bottom: 28px; }
    .step-three-comments-title { text-align: center; margin-bottom: 28px; }
    .comment-lines { min-height: 160px; border-bottom: 1px solid #000; margin-bottom: 16px; white-space: pre-wrap; }
    .step-three-signature { display: flex; justify-content: flex-end; gap: 16px; margin-top: 28px; }
    .step-three-signature-block { width: 42%; text-align: center; }
    .step-three-date-block { width: 22%; text-align: center; }
    .step-three-line { min-height: 32px; border-bottom: 1px solid #000; }
    .step-three-label { font-size: 10px; margin-top: 4px; }
    .step-three-rule { border: 0; border-top: 1px solid #000; margin: 24px 0; }
    .step-three-section { margin-bottom: 28px; page-break-inside: avoid; break-inside: avoid; }
    .step-three-section-title { margin: 0 0 14px; }
    .step-three-fields { display: grid; grid-template-columns: 1fr 1fr; gap: 14px 20px; margin-bottom: 20px; }
    .step-three-field { display: flex; align-items: flex-end; gap: 8px; }
    .step-three-field-label { white-space: nowrap; }
    .step-three-field-value { flex: 1; min-height: 20px; border-bottom: 1px solid #000; word-wrap: break-word; }
    .step-three-result-row { display: flex; align-items: flex-end; flex-wrap: wrap; gap: 16px; margin-bottom: 16px; }
    .step-three-result-field { display: flex; align-items: flex-end; gap: 8px; }
    .step-three-result-field.total { flex: 1; min-width: 200px; }
    .step-three-result-field.rating { flex: 1; min-width: 300px; }
    .step-three-result-value { min-width: 96px; flex: 1; min-height: 20px; border-bottom: 1px solid #000; }
    .step-three-result-field.total .step-three-result-value { max-width: 96px; }
    .step-three-result-field.rating .step-three-result-value { max-width: 128px; }
    .step-three-prepared { display: flex; justify-content: flex-end; gap: 16px; flex-wrap: wrap; }
    .step-three-prepared .step-three-field-value { min-width: 96px; }
    .step-three-action-list { display: grid; gap: 10px; margin: 0 0 28px 16px; }
    .step-three-action { display: flex; align-items: flex-end; gap: 8px; }
    .step-three-action-mark { width: 22px; flex: 0 0 22px; }
    .step-three-action-value { width: 300px; max-width: 100%; min-height: 20px; border-bottom: 1px solid #000; }
    .step-three-approval { display: flex; justify-content: space-between; gap: 32px; flex-wrap: wrap; }
    .step-three-approval-block { width: 45%; min-width: 260px; }
    .step-three-approval-block .step-three-field { margin-bottom: 4px; }
    .step-three-approval-caption { text-align: center; font-size: 10px; font-style: italic; margin-bottom: 18px; }
    .step-three-note { margin-top: 32px; font-size: 10px; }
    @media (max-width: 700px) { .step-three-fields { grid-template-columns: 1fr; } .step-three-signature { justify-content: flex-start; } .step-three-approval-block { width: 100%; min-width: 0; } }
    
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
            <th style="width: 55%; text-align: center; background-color: #0000FE;">Performance Evaluation Factor</th>
            <th>Employee / Ratee</th>
            <th>Supervisor / Rater</th>
            <th>Reviewing Supervisor /<br>Division Head</th>
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
        <div class="sig-line">${params.appraisedBySignature ? `<img src="${params.appraisedBySignature}" class="sig-image" alt="Signature">` : ""}</div>
        <div class="sig-name">${params.appraisedByName || "—"}</div>
        <div class="sig-title">${params.appraisedByTitle || "—"}</div>
        <div class="sig-date">Date: <span>${params.appraisedByDate || "—"}</span></div>
      </div>
      <div class="sig-block">
        <h3>Reviewed By:</h3>
        <div class="sig-line">${params.reviewedBySignature ? `<img src="${params.reviewedBySignature}" class="sig-image" alt="Signature">` : ""}</div>
        <div class="sig-name">${params.reviewedByName || "—"}</div>
        <div class="sig-title">${params.reviewedByTitle || "—"}</div>
        <div class="sig-date">Date: <span>${params.reviewedByDate || "—"}</span></div>
      </div>
      <div class="sig-block">
        <h3>Reviewed With Me:</h3>
        <div class="sig-line">${params.reviewedWithMeSignature ? `<img src="${params.reviewedWithMeSignature}" class="sig-image" alt="Signature">` : ""}</div>
        <div class="sig-name">${params.reviewedWithMeName || "—"}</div>
        <div class="sig-title">${params.reviewedWithMeTitle || "—"}</div>
        <div class="sig-date">Date: <span>${params.reviewedWithMeDate || "—"}</span></div>
      </div>
    </div>
    
    <div class="step-two">
      <header class="step-two-header">
        <h1>Conclusions and Comments</h1>
        <h2>(Confidential: Not to be shown to ratee)</h2>
      </header>
      <div class="step-two-title"><strong>STEP TWO:</strong> Develop conclusion and comments</div>
      <div>
        <section class="step-two-section">
          <div class="step-two-number">1.</div>
          <div class="step-two-content">
            <p>If the overall rating is excellent or poor, explain why the employee was rated such or support rating with specific incidents.</p>
            ${renderLines(params.overallRatingExplanation)}
          </div>
        </section>
        <section class="step-two-section">
          <div class="step-two-number">2.</div>
          <div class="step-two-content">
            <p>Summarize the principal strengths and weakness of the employee.</p>
            <p><strong>Principal Strengths:</strong></p>
            ${renderLines(params.principalStrengths)}
            <p><strong>Principal Weakness:</strong></p>
            ${renderLines(params.principalWeakness)}
            <p>To be more effective on present job the employee should:</p>
            ${renderLines(params.effectivenessRecommendation)}
          </div>
        </section>
        <div class="step-two-grid">
          <section class="step-two-section">
            <div class="step-two-number">3.</div>
            <div class="step-two-content">
              <p>The employee's development potential on present job is:</p>
              <div class="step-two-options">
                ${["Very marked growth expected on present job", "Considerable improvement expected on present job", "Only moderate improvement ahead on present job", "Likely to maintain present performance level on present job", "Likely to become less effective on present job"].map((option) => `<label class="step-two-option"><input type="radio" ${params.developmentPotential === option ? "checked" : ""}/><span>${escapeHtml(option)}</span></label>`).join("")}
              </div>
            </div>
          </section>
          <section class="step-two-section">
            <div class="step-two-number">4.</div>
            <div class="step-two-content">
              <p>The employee's advancement outlook is:</p>
              <div class="step-two-options">
                ${["Promising. Should be able to advance to jobs several levels beyond his present one.", "Fairly Promising. Should be able to advance to job in the next higher level.", "Present job or jobs within the same grade level represent his advancement.", "Employee has difficulty in advancing to his job ceiling.", "Employee should be transferred. Not suited to this job; would fit better in some other jobs."].map((option) => `<label class="step-two-option"><input type="radio" ${params.advancementOutlook === option ? "checked" : ""}/><span>${escapeHtml(option)}</span></label>`).join("")}
              </div>
            </div>
          </section>
        </div>
        <section class="step-two-section">
          <div class="step-two-number">5.</div>
          <div class="step-two-content">
            <p>Suggest ways to accelerate employee's growth and development.</p>
            ${renderLines(params.growthSuggestions)}
          </div>
        </section>
        <section class="step-two-section">
          <div class="step-two-number">6.</div>
          <div class="step-two-content">
            <p>Has the employed expressed any interest in assuming another job or transferring to another company / division / department / section?</p>
            <div class="step-two-transfer"><input type="radio" ${params.transferInterest === "YES" ? "checked" : ""}/><span>YES</span><input type="radio" ${params.transferInterest === "NO" ? "checked" : ""}/><span>NO</span><input type="radio" ${params.transferInterest === "NOT_AWARE" ? "checked" : ""}/><span>NOT AWARE</span></div>
            ${params.transferInterest === "YES" ? `<div class="input-line">If yes, what job? ${text(params.transferJob)}</div><div class="input-line">Where? ${text(params.transferWhere)}</div><div class="input-line">Is he qualified? ${text(params.transferQualified)}</div>` : ""}
          </div>
        </section>
        <section class="step-two-section">
          <div class="step-two-number">7.</div>
          <div class="step-two-content">
            <p>Other comments and recommendations</p>
            ${renderLines(params.otherComments)}
          </div>
        </section>
      </div>
      <footer class="step-two-footer">
        <div class="sig-block">
          <div class="sig-line">${params.appraisedBySignature ? `<img src="${params.appraisedBySignature}" class="sig-image" alt="Signature of rater">` : ""}</div>
          <div class="sig-name">${text(params.appraisedByName)}</div>
          <div class="sig-title">${text(params.appraisedByTitle)}</div>
        </div>
        <div class="step-two-date-block">
          <div class="step-two-date-line">${text(params.appraisedByDate)}</div>
          <div class="step-two-footer-label">Date</div>
        </div>
      </footer>
    </div>

    <div class="step-three">
      <div class="step-three-header">
        <h2>STEP THREE: Reviewed by the Reviewing Supervisor</h2>
      </div>

      <section class="step-three-comments step-three-section">
        <h3 class="step-three-comments-title">COMMENTS AND RECOMMENDATIONS OF<br>REVIEWING SUPERVISOR/DIVISION HEAD</h3>
        <div class="comment-lines">${text(params.stepThreeComments)}${params.stepThreeRecommendations ? `\n${text(params.stepThreeRecommendations)}` : ""}</div>
        <div class="step-three-signature">
          <div class="step-three-signature-block">
            <div class="step-three-line">${text(params.reviewedByName)}</div>
            <div class="step-three-label">Signature of Reviewing<br>Supervisor/Division Head</div>
          </div>
          <div class="step-three-date-block">
            <div class="step-three-line">${text(params.reviewedByDate)}</div>
            <div class="step-three-label">Date</div>
          </div>
        </div>
      </section>

      <hr class="step-three-rule">

      <section class="step-three-section">
        <h3 class="step-three-section-title" style="text-align:center;">TO BE FILLED UP BY THE PERSONNEL OFFICE</h3>
        <div class="step-three-fields">
          <div class="step-three-field"><span class="step-three-field-label">Employee's Present Salary :</span><span class="step-three-field-value">${text(params.presentSalary)}</span></div>
          <div class="step-three-field"><span class="step-three-field-label">Date of Last Increase :</span><span class="step-three-field-value">${text(params.lastIncreaseDate)}</span></div>
          <div class="step-three-field"><span class="step-three-field-label">Nature of Last Increase :</span><span class="step-three-field-value">${text(params.lastIncreaseNature)}</span></div>
          <div class="step-three-field"><span class="step-three-field-label">Amount of Last Increase :</span><span class="step-three-field-value">${text(params.lastIncreaseAmount)}</span></div>
        </div>
      </section>

      <section class="step-three-section">
        <h3 class="step-three-section-title">PERFORMANCE EVALUATION RESULT FOR THIS PERIOD</h3>
        <div class="step-three-result-row">
          <div class="step-three-result-field total"><strong>TOTAL POINTS:</strong><span class="step-three-result-value">${text(params.totalPoints)}</span></div>
          <div class="step-three-result-field rating"><strong>ADJECTIVE RATING:</strong><span class="step-three-result-value">${text(params.adjectiveRating)}</span></div>
        </div>
        <div class="step-three-field" style="margin-bottom:20px;"><span class="step-three-field-label">Recommended Increase / Bonus :</span><span class="step-three-field-value">${text(params.recommendedIncreaseBonus)}</span></div>
        <div class="step-three-prepared">
          <div class="step-three-field"><span class="step-three-field-label">Prepared by:</span><span class="step-three-field-value">${text(params.approvedByName)}</span></div>
          <div class="step-three-field"><span class="step-three-field-label">Date:</span><span class="step-three-field-value">${text(params.formDate || "")}</span></div>
        </div>
      </section>

      <hr class="step-three-rule">

      <section class="step-three-section">
        <h3 class="step-three-section-title">FINAL ACTION RECOMMENDED BY THE PERFORMANCE EVALUATION COMMITTEE:</h3>
        <div class="step-three-action-list">
          <div class="step-three-action"><span class="step-three-action-mark">(${actionMarker("RETAIN")})</span><span>Retain in Present Job</span></div>
          <div class="step-three-action"><span class="step-three-action-mark">(${actionMarker("TRANSFER")})</span><span>Transfer to :</span><span class="step-three-action-value">${params.finalAction === "TRANSFER" ? text(params.finalActionDetails) : ""}</span></div>
          <div class="step-three-action"><span class="step-three-action-mark">(${actionMarker("PROMOTE")})</span><span>Promote to :</span><span class="step-three-action-value">${params.finalAction === "PROMOTE" ? text(params.finalActionDetails) : ""}</span></div>
          <div class="step-three-action"><span class="step-three-action-mark">(${actionMarker("INCREASE_SALARY")})</span><span>Increase Salary by :</span><span class="step-three-action-value">${params.finalAction === "INCREASE_SALARY" ? text(params.finalActionDetails) : ""}</span></div>
          <div class="step-three-action"><span class="step-three-action-mark">(${actionMarker("TRAINING_REQUIRED")})</span><span>Others (Training Required, etc.)</span><span class="step-three-action-value">${params.finalAction === "TRAINING_REQUIRED" || params.finalAction === "OTHER" ? text(params.finalActionDetails) : ""}</span></div>
        </div>
        <div class="step-three-approval">
          <div class="step-three-approval-block">
            <div class="step-three-field"><strong>RECOMMENDED BY:</strong><span class="step-three-field-value"></span></div>
            <div class="step-three-approval-caption">${text(params.committeeRecommendation)}<br>Performance Evaluation Committee<br><strong>CHAIRMAN</strong></div>
            <div class="step-three-field"><strong>DATE :</strong><span class="step-three-field-value">${text(params.formDate || "")}</span></div>
          </div>
          <div class="step-three-approval-block">
            <div class="step-three-field"><strong>APPROVED BY:</strong><span class="step-three-field-value">${text(params.approvedByName)}</span></div>
            <div class="step-three-approval-caption">President</div>
            <div class="step-three-field"><strong>DATE :</strong><span class="step-three-field-value">${text(params.approvedByDate)}</span></div>
          </div>
        </div>
      </section>

      <div class="step-three-note">
        <p><strong><sup>1</sup>N.B. FOR SALES PERSONNEL:</strong></p>
        <div style="margin-left:16px;"><p>Indicate monthly history of:</p><div style="margin-left:16px;"><p>a. Number of Active Accounts</p><p>b. Sales Production (domestic and International) Peso Value</p></div></div>
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

async function convertSignatureToDataUrl(
  admin: any,
  signatureData: { method: string; storage_path?: string; signature_data?: string; content_type?: string } | null,
) {
  if (!signatureData) return undefined;

  if (signatureData.method === "DRAWN" && signatureData.signature_data) {
    return signatureData.signature_data;
  } else if (signatureData.method === "UPLOAD" && signatureData.storage_path) {
    try {
      const { data, error } = await admin.storage.from("employee-files").download(signatureData.storage_path);
      if (!error && data) {
        const buffer = await data.arrayBuffer();
        const bytes = new Uint8Array(buffer);
        const binaryString = bytes.reduce((acc, byte) => acc + String.fromCharCode(byte), "");
        const base64 = btoa(binaryString);
        return `data:${signatureData.content_type || "image/png"};base64,${base64}`;
      }
    } catch (err) {
      console.log(`[convertSignatureToDataUrl] Failed to fetch signature from storage: ${err}`);
    }
  }
  return undefined;
}

/**
 * Generate evaluation sheet data for rendering
 * Returns structured data that can be used by React component or HTML template
 */
export async function createFinalEvaluationDocument(
  evaluationId: string,
  actorUserId: string,
  options: {
    statusOverride?: string;
    finalizedAt?: string;
    finalizationReason?: string;
    forceRefresh?: boolean;
  } = {},
) {
  const admin = await getAdmin();
  const { html } = await generateEvaluationData(evaluationId).then(async (evaluationData) => ({
    html: generateEvaluationHTML(evaluationData),
  }));

  const path = `evaluations/${evaluationId}/final-document.html`;
  const bytes = new TextEncoder().encode(html);
  const { error } = await admin.storage.from("employee-files").upload(path, bytes, {
    contentType: "text/html; charset=utf-8",
    upsert: true,
  });

  if (error) {
    throw new Error(`Failed to store the final evaluation document: ${error.message}`);
  }

  try {
    await admin.from("evaluation_events").insert({
      evaluation_id: evaluationId,
      event_type: "FINAL_DOCUMENT_GENERATED",
      actor_user_id: actorUserId,
      from_status: options.statusOverride ?? null,
      to_status: options.statusOverride ?? null,
      reason: options.finalizationReason ?? null,
    } as never);
  } catch {
    // Non-blocking; document generation should not fail if the audit event insert is unavailable.
  }

  return { path, html };
}

export async function generateEvaluationData(evaluationId: string) {
  const admin = await getAdmin();

  try {
    // Fetch evaluation with its cycle
    const { data: evaluation, error: evalError } = (await admin
      .from("evaluations")
      .select(
        "id, version, employee_id, employee_number_snapshot, full_name_snapshot, job_title_snapshot, division_snapshot, section_snapshot, is_finalized, employee_submitted_at, supervisor_user_id, president_user_id, supervisor_submitted_at, supervisor_remarks, supervisor_step2_overall_explanation, supervisor_step2_strengths, supervisor_step2_weaknesses, supervisor_step2_effectiveness, supervisor_step2_development_potential, supervisor_step2_advancement_outlook, supervisor_step2_growth_suggestions, supervisor_step2_transfer_interest, supervisor_step2_transfer_job, supervisor_step2_transfer_where, supervisor_step2_transfer_qualified, supervisor_step2_other_comments, supervisor_step2_date, cycle_id, evaluation_cycles(name, year, starts_at, ends_at, template_id)",
      )
      .eq("id", evaluationId)
      .maybeSingle()) as any;

    console.log(`[generateEvaluationData] Main query - evaluation found: ${!!evaluation}, error: ${evalError?.message}`);

    if (evalError) throw new Error(`Failed to fetch evaluation: ${evalError.message}`);
    if (!evaluation) throw new Error(`Evaluation not found for ID: ${evaluationId}`);

    console.log(`[generateEvaluationData] Evaluation loaded, processing relationships...`);

    const cycle = (evaluation as never as { evaluation_cycles: { name: string; year: number; starts_at: string; ends_at: string; template_id: string } }).evaluation_cycles;

    // First batch of queries
    const [criteriaResult, ratingsResult, stageSignatureResult, employeeRecordResult, employeeSignaturesResult, internalUserSignaturesResult, reviewingReviewResult, personnelResult, committeeResult] = await Promise.all([
      admin.from("evaluation_criteria").select("id, letter, title, description, position").eq("template_id", cycle.template_id).order("position"),
      admin.from("evaluation_ratings").select("criterion_id, evaluator_type, rating").eq("evaluation_id", evaluationId),
      admin
        .from("evaluation_stage_signatures")
        .select("stage, method, storage_path, signature_data, signer_user_id, signed_at")
        .eq("evaluation_id", evaluationId)
        .in("stage", ["RATER_STEP2", "REVIEWING_SUPERVISOR_STEP3", "PRESIDENT"]),
      evaluation.employee_id ? admin.from("employees").select("full_name, job_title").eq("id", evaluation.employee_id).maybeSingle() : Promise.resolve({ data: null }),
      admin.from("employee_signatures").select("method, storage_path, signature_data, content_type").eq("evaluation_id", evaluationId),
      (admin as any).from("internal_user_signatures").select("user_id, stage, method, storage_path, signature_data, content_type").eq("evaluation_id", evaluationId),
      admin.from("reviewing_supervisor_reviews").select("comments, recommendations, reviewing_supervisor_date, reviewer_user_id").eq("evaluation_id", evaluationId).maybeSingle(),
      admin.from("personnel_processing").select("present_salary, last_increase_date, last_increase_nature, last_increase_amount, total_points, adjective_rating, recommended_increase_bonus").eq("evaluation_id", evaluationId).maybeSingle(),
      admin.from("committee_reviews").select("final_action, action_details, recommendation").eq("evaluation_id", evaluationId).maybeSingle(),
    ]);

    console.log(`[generateEvaluationData] Criteria: ${criteriaResult.data?.length || 0}, Ratings: ${ratingsResult.data?.length || 0}, Signatures: ${stageSignatureResult.data?.length || 0}, Employee: ${!!employeeRecordResult?.data}`);

    // Get reviewing supervisor info
    const { data: step3Result } = (await admin.from("reviewing_supervisor_reviews").select("reviewer_user_id").eq("evaluation_id", evaluationId).maybeSingle()) as any;

    // Fetch internal users that we need
    const userIds = [evaluation.supervisor_user_id, step3Result?.reviewer_user_id, evaluation.president_user_id].filter((id): id is string => Boolean(id));
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

    const userLookup = new Map((userListResult ?? []).map((user: any) => [user.id, { full_name: user.full_name, job_title: user.job_title ?? null }]));
    const raterUser = evaluation.supervisor_user_id ? userLookup.get(evaluation.supervisor_user_id) ?? null : null;
    const reviewingSupervisorUser = step3Result?.reviewer_user_id ? userLookup.get(step3Result.reviewer_user_id) ?? null : null;
    const employeeName = employeeRecordResult?.data?.full_name ?? evaluation.full_name_snapshot ?? "—";
    const employeeJobTitle = employeeRecordResult?.data?.job_title ?? evaluation.job_title_snapshot ?? "Ratee / Employee";
    const raterName = raterUser?.full_name ?? "—";
    const raterTitle = raterUser?.job_title ?? "Rater / Immediate Supervisor";
    const reviewingSupervisorName = reviewingSupervisorUser?.full_name ?? "—";
    const reviewingSupervisorTitle = reviewingSupervisorUser?.job_title ?? "Reviewing Supervisor / Division Head";
    const presidentUser = evaluation.president_user_id ? userLookup.get(evaluation.president_user_id) ?? null : null;
    const periodFrom = formatFormDate(cycle.starts_at) || `January 1, ${cycle.year}`;
    const periodTo = formatFormDate(cycle.ends_at) || `December 31, ${cycle.year}`;

    // Convert employee signature to base64 data URL using helper function
    const reviewedWithMeSignature = await convertSignatureToDataUrl(admin, (employeeSignaturesResult.data?.[0] ?? null) as any);

    // Get employee submission date
    const reviewedWithMeDateStr = evaluation.employee_submitted_at ? formatDate(evaluation.employee_submitted_at) : "—";

    // Use the actual saved stage signatures from the submitted workflow, with the internal-user table as a fallback only.
    const stageSignatureMap = new Map((stageSignatureResult.data ?? []).map((signature: any) => [signature.stage, signature]));
    const internalSignatureMap = new Map((internalUserSignaturesResult.data ?? []).map((signature: any) => [signature.stage, signature]));

    const raterStage = stageSignatureMap.get("RATER_STEP2") ?? internalSignatureMap.get("RATER_STEP2");
    const reviewerStage = stageSignatureMap.get("REVIEWING_SUPERVISOR_STEP3") ?? internalSignatureMap.get("REVIEWING_SUPERVISOR_STEP3");

    const appraisedBySignature = raterStage ? await convertSignatureToDataUrl(admin, raterStage as any) : undefined;
    const reviewedBySignature = reviewerStage ? await convertSignatureToDataUrl(admin, reviewerStage as any) : undefined;
    const raterStep2Date = evaluation.supervisor_step2_date ?? (stageSignatureResult.data ?? []).find((s) => s.stage === "RATER_STEP2")?.signed_at ?? null;
    const reviewerStep3Date = (stageSignatureResult.data ?? []).find((s) => s.stage === "REVIEWING_SUPERVISOR_STEP3")?.signed_at ?? null;
    const presidentSignature = (stageSignatureResult.data ?? []).find((s) => s.stage === "PRESIDENT");

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
      appraisedByDate: formatDate(raterStep2Date),
      appraisedBySignature,
      reviewedByName: reviewingSupervisorName,
      reviewedByTitle: reviewingSupervisorTitle,
      reviewedByDate: formatDate(reviewerStep3Date),
      reviewedBySignature,
      reviewedWithMeName: employeeName,
      reviewedWithMeTitle: "Ratee / Employee",
      reviewedWithMeDate: reviewedWithMeDateStr,
      reviewedWithMeSignature,
      overallRatingExplanation: normalizeText(evaluation.supervisor_step2_overall_explanation),
      principalStrengths: normalizeText(evaluation.supervisor_step2_strengths),
      principalWeakness: normalizeText(evaluation.supervisor_step2_weaknesses),
      effectivenessRecommendation: normalizeText(evaluation.supervisor_step2_effectiveness),
      developmentPotential: normalizeText(evaluation.supervisor_step2_development_potential),
      advancementOutlook: normalizeText(evaluation.supervisor_step2_advancement_outlook),
      growthSuggestions: normalizeText(evaluation.supervisor_step2_growth_suggestions),
      transferInterest: normalizeText(evaluation.supervisor_step2_transfer_interest),
      transferJob: normalizeText(evaluation.supervisor_step2_transfer_job),
      transferWhere: normalizeText(evaluation.supervisor_step2_transfer_where),
      transferQualified: normalizeText(evaluation.supervisor_step2_transfer_qualified),
      otherComments: normalizeText(evaluation.supervisor_step2_other_comments),
      stepThreeComments: normalizeText(reviewingReviewResult.data?.comments),
      stepThreeRecommendations: normalizeText(reviewingReviewResult.data?.recommendations),
      presentSalary: normalizeText(personnelResult.data?.present_salary),
      lastIncreaseDate: formatDate(personnelResult.data?.last_increase_date),
      lastIncreaseNature: normalizeText(personnelResult.data?.last_increase_nature),
      lastIncreaseAmount: normalizeText(personnelResult.data?.last_increase_amount),
      totalPoints: normalizeText(personnelResult.data?.total_points),
      adjectiveRating: normalizeText(personnelResult.data?.adjective_rating),
      recommendedIncreaseBonus: normalizeText(personnelResult.data?.recommended_increase_bonus),
      finalAction: normalizeText(committeeResult.data?.final_action),
      finalActionDetails: normalizeText(committeeResult.data?.action_details),
      committeeRecommendation: normalizeText(committeeResult.data?.recommendation),
      approvedByName: presidentUser?.full_name ?? "President",
      approvedByDate: formatDate(presidentSignature?.signed_at),
      formDate: new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }),
    };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error(`[generateEvaluationData] Error:`, errorMsg, error);
    throw new Error(`Error generating evaluation data: ${errorMsg}`);
  }
}
