import React from "react";

/**
 * PRIORITY HANDLING LOGISTICS, INC.
 * Performance Evaluation Sheet for Non-Supervisory Staff
 *
 * Built for document generation — pure presentational component,
 * all data comes in via props. Designed to match the original
 * paper form 1:1 (layout, borders, columns, sections).
 */

export interface EvaluationFactorScore {
  /** Row letter, e.g. "A", "B", "C" */
  letter: string;
  /** Bold factor name, e.g. "QUALITY OF WORK." */
  title: string;
  /** Description text that follows the bold title */
  description: string;
  employeeSelfRating: number | string;
  supervisorRating: number | string;
  reviewingSupervisorRating: number | string;
}

export interface SignatureBlock {
  name: string;
  jobTitle: string;
  date: string;
  /** Optional signature image (base64 / URL). If omitted, a blank line is shown. */
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

  /** Optional — conclusions section, hidden from ratee in real usage */
  overallRatingExplanation?: string;
  principalStrengths?: string;
  principalWeakness?: string;
  effectivenessRecommendation?: string;
}

const LabeledField: React.FC<{
  label: string;
  value: string;
  labelWidth?: string;
}> = ({ label, value, labelWidth = "auto" }) => (
  <div className="flex items-baseline gap-2">
    <span
      className="font-bold text-[13px] tracking-tight whitespace-nowrap"
      style={{ minWidth: labelWidth }}
    >
      {label}
    </span>
    <span className="flex-1 border-b border-black text-[13px] px-1 pb-0.5">
      {value}
    </span>
  </div>
);

const SignatureColumn: React.FC<{
  heading: string;
  subheading: string;
  block: SignatureBlock;
}> = ({ heading, subheading, block }) => (
  <div className="flex flex-col px-4 pt-3 pb-2">
    <p className="font-bold text-[12px]">{heading}</p>
    <p className="text-[11px] text-black">{subheading}</p>

    <div className="h-16 flex items-end justify-center">
      {block.signatureImageSrc ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={block.signatureImageSrc}
          alt={`Signature of ${block.name}`}
          className="max-h-16 object-contain"
        />
      ) : null}
    </div>

    <div className="border-t border-black pt-1 text-center">
      <p className="font-bold text-[12px]">{block.name}</p>
      <p className="text-[11px]">{block.jobTitle}</p>
    </div>

    <div className="flex items-baseline gap-2 mt-3">
      <span className="font-bold text-[12px]">Date:</span>
      <span className="flex-1 border-b border-black text-[12px] px-1">
        {block.date}
      </span>
    </div>
  </div>
);

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
}) => {
  return (
    <div className="w-[1024px] mx-auto bg-white text-black border border-black font-sans">
      {/* ===================== HEADER ===================== */}
      <div className="px-8 pt-6 pb-4">
        <h1 className="text-[26px] font-extrabold tracking-tight leading-none">
          {companyName}
        </h1>
        <p className="text-[13px] mt-1">{companyAddress}</p>

        <div className="text-center mt-6">
          <h2 className="text-[20px] font-extrabold tracking-tight">
            PERFORMANCE EVALUATION SHEET
          </h2>
          <h2 className="text-[20px] font-extrabold tracking-tight">
            FOR NON-SUPERVISORY STAFF
          </h2>
        </div>

        {/* Period covered */}
        <div className="flex items-baseline gap-2 mt-6 text-[13px]">
          <span className="font-bold">PERIOD COVERED :</span>
          <span className="font-bold ml-2">FROM</span>
          <span className="border-b border-black px-2 min-w-[140px]">
            {periodFrom}
          </span>
          <span className="font-bold ml-4">TO</span>
          <span className="border-b border-black px-2 min-w-[140px]">
            {periodTo}
          </span>
        </div>

        {/* Ratee / Rater grid */}
        <div className="grid grid-cols-2 gap-x-8 gap-y-2 mt-4">
          <LabeledField
            label="NAME OF RATEE :"
            value={nameOfRatee}
            labelWidth="160px"
          />
          <LabeledField
            label="JOB TITLE OF RATEE :"
            value={jobTitleOfRatee}
            labelWidth="170px"
          />
          <LabeledField
            label="DIVISION/DEPT :"
            value={division}
            labelWidth="160px"
          />
          <LabeledField
            label="SECTION/UNIT :"
            value={sectionUnit}
            labelWidth="170px"
          />
          <LabeledField
            label="NAME OF RATER :"
            value={nameOfRater}
            labelWidth="160px"
          />
          <LabeledField
            label="JOB TITLE OF RATER :"
            value={jobTitleOfRater}
            labelWidth="170px"
          />
        </div>
      </div>

      {/* ===================== RATING LEGEND ===================== */}
      <div className="mx-8 border border-black">
        <div className="flex items-center justify-center gap-8 py-2 text-[13px]">
          <span className="font-bold">RATING:</span>
          <span>1 – Poor</span>
          <span>2 – Below Average</span>
          <span>3 – Average</span>
          <span>4 – Above Average</span>
          <span>5 – Excellent</span>
        </div>
      </div>

      {/* ===================== FACTOR TABLE ===================== */}
      <div className="mx-8 mt-4 border border-black border-b-0">
        {/* Table header row */}
        <div className="grid grid-cols-[36px_1fr_140px_140px_150px] border-b border-black bg-white">
          <div className="border-r border-black" />
          <div className="border-r border-black flex items-center justify-center py-2">
            <span className="font-bold text-[13px] tracking-wide">
              PERFORMANCE EVALUATION FACTOR
            </span>
          </div>
          <div className="border-r border-black flex flex-col items-center justify-center py-2 bg-blue-50">
            <span className="font-bold text-[12px]">EMPLOYEE / RATEE</span>
            <span className="text-[11px]">(Self Rating)</span>
          </div>
          <div className="border-r border-black flex flex-col items-center justify-center py-2 bg-green-50">
            <span className="font-bold text-[12px]">SUPERVISOR / RATER</span>
            <span className="text-[11px]">(Rating)</span>
          </div>
          <div className="flex flex-col items-center justify-center py-2 text-center bg-orange-50">
            <span className="font-bold text-[12px] leading-tight">
              REVIEWING SUPERVISOR /<br />
              DIVISION HEAD
            </span>
            <span className="text-[11px]">(Rating)</span>
          </div>
        </div>

        {/* Factor rows */}
        {factors.map((f, i) => (
          <div
            key={f.letter}
            className={`grid grid-cols-[36px_1fr_140px_140px_150px] ${
              i !== factors.length - 1 ? "border-b border-black" : ""
            }`}
          >
            <div className="border-r border-black flex items-start justify-center pt-2 text-[13px] font-bold">
              {f.letter}.
            </div>
            <div className="border-r border-black px-3 py-2 text-[12.5px] leading-snug">
              <span className="font-bold">{f.title}</span> {f.description}
            </div>
            <div className="border-r border-black flex items-center justify-center text-[18px] font-bold">
              {f.employeeSelfRating}
            </div>
            <div className="border-r border-black flex items-center justify-center text-[18px] font-bold">
              {f.supervisorRating}
            </div>
            <div className="flex items-center justify-center text-[18px] font-bold">
              {f.reviewingSupervisorRating}
            </div>
          </div>
        ))}
      </div>

      {/* ===================== SIGNATURE BLOCKS ===================== */}
      <div className="mx-8 mt-6 border border-black grid grid-cols-3 divide-x divide-black">
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

      {/* ===================== CONCLUSIONS ===================== */}
      <div className="mx-8 my-6 pt-4 border-t-2 border-black">
        <p className="text-center font-bold text-[13px]">
          CONCLUSIONS AND COMMENTS (CONFIDENTIAL: NOT TO BE SHOWN TO RATEE)
        </p>

        <p className="font-bold text-[13px] mt-3">
          STEP TWO:{" "}
          <span className="font-normal">Develop conclusion and comments</span>
        </p>

        <div className="text-[13px] mt-3 space-y-1">
          <p>
            1. If the overall rating is excellent or poor, explain why the
            employee was rated such or support rating with specific
            incidents.
          </p>
          <div className="border-b border-black h-5">{overallRatingExplanation}</div>
          <div className="border-b border-black h-5" />
        </div>

        <div className="text-[13px] mt-4 space-y-2">
          <p>2. Summarize the principal strengths and weakness of the employee.</p>
          <div className="flex gap-4">
            <div className="flex-1 flex items-baseline gap-2">
              <span className="whitespace-nowrap">Principal Strengths:</span>
              <span className="flex-1 border-b border-black px-1">
                {principalStrengths}
              </span>
            </div>
            <div className="flex-1 flex items-baseline gap-2">
              <span className="whitespace-nowrap">Principal Weakness:</span>
              <span className="flex-1 border-b border-black px-1">
                {principalWeakness}
              </span>
            </div>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="whitespace-nowrap">
              To be more effective on present job the employee should:
            </span>
            <span className="flex-1 border-b border-black px-1">
              {effectivenessRecommendation}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PerformanceEvaluationSheet;

/* ============================================================
 * EXAMPLE USAGE — matches the reference document exactly
 * ============================================================
 *
 * <PerformanceEvaluationSheet
 *   companyName="PRIORITY HANDLING LOGISTICS, INC."
 *   companyAddress="1618-B Copernico St., San Isidro, Makati City"
 *   periodFrom="January 1, 2026"
 *   periodTo="December 31, 2026"
 *   nameOfRatee="Juan Dela Cruz"
 *   jobTitleOfRatee="Logistics Assistant"
 *   division="Operations Department"
 *   sectionUnit="Warehousing Unit"
 *   nameOfRater="Michael Smith"
 *   jobTitleOfRater="Operations Supervisor"
 *   factors={[
 *     { letter: "A", title: "QUALITY OF WORK.", description: "Consider the neatness, accuracy, and completeness of the employee's work in relation to company standards.", employeeSelfRating: 4, supervisorRating: 5, reviewingSupervisorRating: 4 },
 *     { letter: "B", title: "QUANTITY OF WORK.", description: "Consider the volume of work done by the employee and the speed at which work was satisfactorily completed.", employeeSelfRating: 5, supervisorRating: 4, reviewingSupervisorRating: 5 },
 *     { letter: "C", title: "JOB KNOWLEDGE.", description: "Consider the employee's skill, knowledge, and understanding of the details of his regularly assigned work.", employeeSelfRating: 4, supervisorRating: 4, reviewingSupervisorRating: 5 },
 *     { letter: "D", title: "ABILITY TO LEARN.", description: "Consider the employee's ability to learn new job procedures and methods and his speed in grasping instructions.", employeeSelfRating: 5, supervisorRating: 4, reviewingSupervisorRating: 4 },
 *     { letter: "E", title: "DEPENDABILITY.", description: "Consider the employee's attendance, punctuality and the seriousness with which he performs his duties.", employeeSelfRating: 4, supervisorRating: 5, reviewingSupervisorRating: 4 },
 *     { letter: "F", title: "INITIATIVE.", description: "Consider the employee's resourcefulness or ability to develop new approaches to problems as required by his job.", employeeSelfRating: 5, supervisorRating: 4, reviewingSupervisorRating: 5 },
 *     { letter: "G", title: "HUMAN RELATIONS/TEAMWORK.", description: "Consider the employee's ability to get along with co-employees and client personal and his sense of organizational loyalty.", employeeSelfRating: 4, supervisorRating: 5, reviewingSupervisorRating: 4 },
 *     { letter: "H", title: "COST CONSCIOUSNESS.", description: "Consider the employee's attitude toward cost objectives in relation to his work, his efforts at preventing waste and generating cost savings.", employeeSelfRating: 4, supervisorRating: 4, reviewingSupervisorRating: 5 },
 *     { letter: "I", title: "DISCIPLINE.", description: "Consider the employee's conduct on the job, his attitude towards company rules and his efforts at promoting harmonious relationships among others.", employeeSelfRating: 5, supervisorRating: 5, reviewingSupervisorRating: 4 },
 *     { letter: "J", title: "SAFETY CONSCIOUSNESS/CARE OF EQUIPMENT.", description: "Consider the manner in which the employee handles himself, the materials, and the equipment in a work situation and his safety consciousness.", employeeSelfRating: 5, supervisorRating: 4, reviewingSupervisorRating: 5 },
 *   ]}
 *   appraisedBy={{ name: "Michael Smith", jobTitle: "Operations Supervisor", date: "August 31, 2026" }}
 *   reviewedBy={{ name: "Maria Santos", jobTitle: "Division Head – Operations", date: "September 2, 2026" }}
 *   reviewedWithMe={{ name: "Juan Dela Cruz", jobTitle: "Logistics Assistant", date: "August 31, 2026" }}
 * />
 */
