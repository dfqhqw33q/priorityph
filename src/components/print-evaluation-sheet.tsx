import React from "react";

export interface EvaluationFactorScore {
  letter: string;
  title: string;
  description: string;
  employeeSelfRating: number | string;
  supervisorRating: number | string;
  reviewingSupervisorRating: number | string;
}

export interface SignatureBlock {
  name: string;
  jobTitle: string;
  date: string;
  signatureImageSrc?: string;
}

export interface PerformanceEvaluationSheetProps {
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
  factors: EvaluationFactorScore[];
  appraisedBy: SignatureBlock;
  reviewedBy: SignatureBlock;
  reviewedWithMe: SignatureBlock;
  overallRatingExplanation?: string;
  principalStrengths?: string;
  principalWeakness?: string;
  effectivenessRecommendation?: string;
}

/**
 * InfoField Component - Responsive field with label and underlined value
 */
const InfoField: React.FC<{ label: string; value: string; className?: string }> = ({
  label,
  value,
  className = "flex-1",
}) => (
  <div className={`flex items-center gap-2 ${className}`}>
    <span className="font-semibold text-[11px] uppercase whitespace-nowrap">{label}:</span>
    <div className="border-b border-black flex-1 text-[12px] px-2 py-0.5 break-words min-h-[18px]">
      {value || " "}
    </div>
  </div>
);

/**
 * SignatureColumn Component - Renders a single signature block
 */
const SignatureColumn: React.FC<{
  heading: string;
  subheading: string;
  block: SignatureBlock;
}> = ({ heading, subheading, block }) => (
  <div className="flex-1 border-l border-black first:border-l-0 px-3 py-3 flex flex-col">
    <div className="text-center font-bold uppercase text-[11px] leading-tight mb-1 break-words">
      {heading}
    </div>
    <div className="text-center text-[10px] leading-tight mb-4 break-words">
      {subheading}
    </div>
    <div className="flex-1 flex items-center justify-center border-b border-black mb-1 min-h-[40px]">
      {block.signatureImageSrc && (
        <img
          src={block.signatureImageSrc}
          alt={`Signature of ${block.name}`}
          className="max-h-[35px] object-contain"
        />
      )}
    </div>
    <div className="text-center font-bold text-[11px] leading-tight break-words mb-1">
      {block.name || "—"}
    </div>
    <div className="text-center text-[10px] leading-tight break-words mb-3">
      {block.jobTitle || "—"}
    </div>
    <div className="flex items-center justify-center gap-1">
      <span className="font-bold text-[10px] whitespace-nowrap">Date:</span>
      <div className="flex-1 border-b border-black text-center text-[10px] px-1 min-h-[16px]">
        {block.date || "—"}
      </div>
    </div>
  </div>
);

/**
 * PerformanceEvaluationSheet Component
 * Fully responsive, print-optimized performance evaluation form
 * Supports automatic page breaks and flexible content height
 */
export const PerformanceEvaluationSheet: React.FC<
  PerformanceEvaluationSheetProps
> = ({
  companyName,
  companyAddress,
  periodFrom,
  periodTo,
  nameOfRatee,
  jobTitleOfRatee,
  division,
  sectionUnit,
  nameOfRater,
  jobTitleOfRater,
  factors,
  appraisedBy,
  reviewedBy,
  reviewedWithMe,
  overallRatingExplanation = "",
  principalStrengths = "",
  principalWeakness = "",
  effectivenessRecommendation = "",
}) => (
  <div className="bg-white text-black font-sans">
    <style>{`
      @media print {
        * {
          margin: 0;
          padding: 0;
          -webkit-print-color-adjust: exact;
          print-color-adjust: exact;
          color-adjust: exact;
        }
        html, body {
          margin: 0;
          padding: 0;
          background: white;
          height: auto;
          width: 100%;
        }
        @page {
          size: A4 portrait;
          margin: 0.5in;
          orphans: 3;
          widows: 3;
        }
        .evaluation-document {
          page-break-after: auto;
          width: 100%;
        }
        .form-header {
          page-break-inside: avoid;
          break-inside: avoid;
        }
        .rating-scale {
          page-break-inside: avoid;
          break-inside: avoid;
        }
        .evaluation-table {
          page-break-inside: auto;
          width: 100%;
          border-collapse: collapse;
        }
        .evaluation-table tbody tr {
          page-break-inside: avoid;
          break-inside: avoid;
        }
        .evaluation-table td {
          page-break-inside: avoid;
        }
        .signatures-section {
          page-break-inside: avoid;
          break-inside: avoid;
        }
        .conclusions-section {
          page-break-inside: auto;
        }
      }
    `}

    <main className="max-w-5xl mx-auto bg-white text-[12px] leading-normal print:max-w-none print:mx-0">
      {/* ===== HEADER SECTION ===== */}
      <header className="form-header mb-6 px-6 py-8 print:px-10 print:py-6">
        <h1 className="text-[18px] font-extrabold uppercase text-center leading-tight">
          {companyName}
        </h1>
        <p className="text-[11px] text-center leading-tight mt-1">{companyAddress}</p>

        <div className="text-center mt-6 mb-8">
          <h2 className="text-[16px] font-extrabold uppercase leading-tight">
            PERFORMANCE EVALUATION SHEET
          </h2>
          <h3 className="text-[14px] font-extrabold uppercase leading-tight">
            FOR NON-SUPERVISORY STAFF
          </h3>
        </div>

        {/* Period Covered */}
        <div className="mb-6">
          <div className="flex items-center gap-2 mb-2">
            <span className="font-semibold text-[11px] uppercase whitespace-nowrap">
              Period Covered:
            </span>
            <span className="text-[11px] whitespace-nowrap">FROM</span>
            <div className="flex-1 border-b border-black text-center text-[12px] px-2 py-0.5">
              {periodFrom}
            </div>
            <span className="text-[11px] whitespace-nowrap">TO</span>
            <div className="flex-1 border-b border-black text-center text-[12px] px-2 py-0.5">
              {periodTo}
            </div>
          </div>
        </div>

        {/* Employee Information Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-x-6 gap-y-3 mb-6">
          <InfoField label="NAME OF RATEE" value={nameOfRatee} />
          <InfoField label="JOB TITLE OF RATEE" value={jobTitleOfRatee} />
          <InfoField label="DIVISION/DEPT" value={division} />
          <InfoField label="SECTION/UNIT" value={sectionUnit} />
          <InfoField label="NAME OF RATER" value={nameOfRater} />
          <InfoField label="JOB TITLE OF RATER" value={jobTitleOfRater} />
        </div>
      </header>

      {/* ===== RATING SCALE ===== */}
      <div className="rating-scale border border-black mx-6 print:mx-10 px-4 py-2 mb-6 flex flex-wrap justify-between gap-2 font-semibold text-[11px]">
        <span>RATING:</span>
        <span>1 - Poor</span>
        <span>2 - Below Average</span>
        <span>3 - Average</span>
        <span>4 - Above Average</span>
        <span>5 - Excellent</span>
      </div>

      {/* ===== EVALUATION TABLE ===== */}
      <div className="mx-6 print:mx-10 mb-8 overflow-x-auto">
        <table className="evaluation-table w-full text-left border border-black">
          <thead>
            <tr className="bg-[#d4d4d4] text-[11px] font-bold leading-tight">
              <th className="border border-black p-3 uppercase text-left w-[55%]">
                Performance Evaluation Factor
              </th>
              <th className="border border-black p-3 uppercase text-center bg-[#dce8ff] text-[10px]">
                <div>Employee / Ratee</div>
                <div className="font-normal capitalize">(Self Rating)</div>
              </th>
              <th className="border border-black p-3 uppercase text-center bg-[#dff3df] text-[10px]">
                <div>Supervisor / Rater</div>
                <div className="font-normal capitalize">(Rating)</div>
              </th>
              <th className="border border-black p-3 uppercase text-center bg-[#f9e8cf] text-[10px]">
                <div>Reviewing Supervisor /</div>
                <div>Division Head</div>
                <div className="font-normal capitalize">(Rating)</div>
              </th>
            </tr>
          </thead>
          <tbody>
            {factors.map((factor) => (
              <tr key={factor.letter} className="border-b border-black">
                <td className="border border-black p-3 align-top">
                  <div className="flex gap-2">
                    <span className="font-bold whitespace-nowrap flex-shrink-0">
                      {factor.letter}.
                    </span>
                    <div className="flex-1">
                      <span className="font-bold uppercase text-[12px]">
                        {factor.title}.
                      </span>{" "}
                      <span className="text-[12px] break-words">
                        {factor.description}
                      </span>
                    </div>
                  </div>
                </td>
                <td className="border border-black p-3 text-center font-bold text-[18px] align-middle">
                  {factor.employeeSelfRating}
                </td>
                <td className="border border-black p-3 text-center font-bold text-[18px] align-middle">
                  {factor.supervisorRating}
                </td>
                <td className="border border-black p-3 text-center font-bold text-[18px] align-middle">
                  {factor.reviewingSupervisorRating}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* ===== SIGNATURES SECTION ===== */}
      <div className="signatures-section border-t border-b border-black mx-6 print:mx-10 flex mb-8">
        <SignatureColumn
          heading="APPRAISED BY:"
          subheading="Rater / Immediate Supervisor"
          block={appraisedBy}
        />
        <SignatureColumn
          heading="REVIEWED BY:"
          subheading="Reviewing Supervisor / Division Head"
          block={reviewedBy}
        />
        <SignatureColumn
          heading="REVIEWED WITH ME:"
          subheading="Ratee / Employee"
          block={reviewedWithMe}
        />
      </div>

      {/* ===== CONCLUSIONS SECTION ===== */}
      <div className="conclusions-section mx-6 print:mx-10 mb-8 border-t border-black pt-6">
        <h4 className="text-center font-bold text-[12px] uppercase mb-4 leading-tight">
          Conclusions and Comments (Confidential: Not to be Shown to Ratee)
        </h4>

        <div className="mb-4">
          <div className="font-bold text-[12px] mb-2">STEP TWO: Develop conclusion and comments</div>
        </div>

        {/* Question 1 */}
        <div className="mb-6">
          <p className="text-[12px] mb-2">
            1. If the overall rating is excellent or poor, explain why the employee was
            rated such or support rating with specific incidents.
          </p>
          <div className="border-b border-black min-h-[40px] mb-2 px-2 py-1 text-[12px] break-words">
            {overallRatingExplanation}
          </div>
          <div className="border-b border-black min-h-[40px] px-2" />
        </div>

        {/* Question 2 */}
        <div>
          <p className="text-[12px] mb-3">
            2. Summarize the principal strengths and weakness of the employee.
          </p>

          <div className="mb-3">
            <div className="flex gap-2 mb-2 text-[12px]">
              <span className="font-semibold whitespace-nowrap">Principal Strengths:</span>
              <div className="flex-1 border-b border-black px-2 py-1 break-words min-h-[24px]">
                {principalStrengths}
              </div>
            </div>
            <div className="flex gap-2 text-[12px]">
              <span className="font-semibold whitespace-nowrap">Principal Weakness:</span>
              <div className="flex-1 border-b border-black px-2 py-1 break-words min-h-[24px]">
                {principalWeakness}
              </div>
            </div>
          </div>

          <div className="flex gap-2 text-[12px]">
            <span className="font-semibold">To be more effective on present job the employee should:</span>
            <div className="flex-1 border-b border-black px-2 py-1 break-words min-h-[24px]">
              {effectivenessRecommendation}
            </div>
          </div>
        </div>
      </div>
    </main>
  </div>
);

export default PerformanceEvaluationSheet;
