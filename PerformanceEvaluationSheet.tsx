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

const UnderlinedField: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <div className="flex items-baseline gap-1 min-w-0">
    <span className="font-bold text-[12px] tracking-tight whitespace-nowrap">{label}</span>
    <span className="flex-1 min-w-0 border-b border-black text-[12px] px-1 pb-0.5">{value}</span>
  </div>
);

const SigCol: React.FC<{ heading: string; subheading: string; block: SignatureBlock }> = ({
  heading, subheading, block,
}) => (
  <div className="flex flex-col px-3 pt-2 pb-2">
    <p className="font-bold text-[11px]">{heading}</p>
    <p className="text-[10px]">{subheading}</p>
    <div className="h-[52px] flex items-end">
      {block.signatureImageSrc ? (
        <img src={block.signatureImageSrc} alt={`Signature of ${block.name}`} className="max-h-[48px] object-contain" />
      ) : null}
    </div>
    <div className="border-t border-black pt-1">
      <p className="font-bold text-[11px] leading-tight">{block.name}</p>
      <p className="text-[10px] leading-tight">{block.jobTitle}</p>
    </div>
    <div className="flex items-baseline gap-1 mt-2">
      <span className="font-bold text-[11px]">Date:</span>
      <span className="flex-1 border-b border-black text-[11px] px-1">{block.date}</span>
    </div>
  </div>
);

export const PerformanceEvaluationSheet: React.FC<PerformanceEvaluationSheetProps> = ({
  companyName, companyAddress, periodFrom, periodTo,
  nameOfRatee, jobTitleOfRatee, division, sectionUnit, nameOfRater, jobTitleOfRater,
  factors, appraisedBy, reviewedBy, reviewedWithMe,
  overallRatingExplanation = "", principalStrengths = "", principalWeakness = "",
  effectivenessRecommendation = "",
}) => (
  <div className="w-[794px] mx-auto bg-white text-black font-sans text-[12px] border border-black">
    {/* HEADER */}
    <div className="px-8 pt-5 pb-3">
      <h1 className="text-[18px] font-extrabold tracking-tight leading-tight">{companyName}</h1>
      <p className="text-[11px] mt-0.5">{companyAddress}</p>
      <div className="text-center mt-4">
        <h2 className="text-[16px] font-extrabold tracking-tight leading-tight">
          PERFORMANCE EVALUATION SHEET
        </h2>
        <h2 className="text-[13px] font-extrabold tracking-tight leading-tight">
          FOR NON-SUPERVISORY STAFF
        </h2>
      </div>
      <div className="flex items-baseline gap-2 mt-4 text-[12px]">
        <span className="font-bold whitespace-nowrap">PERIOD COVERED :</span>
        <span className="font-bold ml-1">FROM</span>
        <span className="border-b border-black px-2 min-w-[130px]">{periodFrom}</span>
        <span className="font-bold ml-2">TO</span>
        <span className="border-b border-black px-2 min-w-[130px]">{periodTo}</span>
      </div>
      <div className="grid grid-cols-2 gap-x-6 gap-y-2 mt-3">
        <UnderlinedField label="NAME OF RATEE :" value={nameOfRatee} />
        <UnderlinedField label="JOB TITLE OF RATEE :" value={jobTitleOfRatee} />
        <UnderlinedField label="DIVISION/DEPT :" value={division} />
        <UnderlinedField label="SECTION/UNIT :" value={sectionUnit} />
        <UnderlinedField label="NAME OF RATER :" value={nameOfRater} />
        <UnderlinedField label="JOB TITLE OF RATER :" value={jobTitleOfRater} />
      </div>
    </div>

    {/* RATING LEGEND */}
    <div className="mx-8 border border-black">
      <div className="flex items-center justify-center gap-6 py-1.5 text-[12px] font-bold">
        <span>RATING:</span>
        <span>1 &ndash; Poor</span>
        <span>2 &ndash; Below Average</span>
        <span>3 &ndash; Average</span>
        <span>4 &ndash; Above Average</span>
        <span>5 &ndash; Excellent</span>
      </div>
    </div>

    {/* FACTOR TABLE */}
    <div className="mx-8 mt-3 border border-black">
      <div
        className="grid border-b border-black bg-[#d4d4d4]"
        style={{ gridTemplateColumns: "55% 15% 15% 15%" }}
      >
        <div className="border-r border-black flex items-center justify-center py-2.5 text-center px-2">
          <span className="font-bold text-[11.5px] tracking-wide">PERFORMANCE EVALUATION FACTOR</span>
        </div>
        <div className="border-r border-black flex flex-col items-center justify-center py-2.5 text-center">
          <span className="font-bold text-[10.5px] leading-tight">EMPLOYEE / RATEE</span>
          <span className="text-[9.5px]">(Self Rating)</span>
        </div>
        <div className="border-r border-black flex flex-col items-center justify-center py-2.5 text-center">
          <span className="font-bold text-[10.5px] leading-tight">SUPERVISOR / RATER</span>
          <span className="text-[9.5px]">(Rating)</span>
        </div>
        <div className="flex flex-col items-center justify-center py-2.5 text-center px-1">
          <span className="font-bold text-[10.5px] leading-tight">
            REVIEWING SUPERVISOR /<br />DIVISION HEAD
          </span>
          <span className="text-[9.5px]">(Rating)</span>
        </div>
      </div>

      {factors.map((f, i) => (
        <div
          key={f.letter}
          className={`grid${i !== factors.length - 1 ? " border-b border-black" : ""}`}
          style={{ gridTemplateColumns: "55% 15% 15% 15%" }}
        >
          <div className="border-r border-black px-3 py-2 text-[11px] leading-snug">
            <span className="font-bold">{f.letter}.&nbsp;&nbsp;{f.title}</span>{" "}
            {f.description}
          </div>
          <div className="border-r border-black flex items-center justify-center text-[20px] font-bold">
            {f.employeeSelfRating}
          </div>
          <div className="border-r border-black flex items-center justify-center text-[20px] font-bold">
            {f.supervisorRating}
          </div>
          <div className="flex items-center justify-center text-[20px] font-bold">
            {f.reviewingSupervisorRating}
          </div>
        </div>
      ))}
    </div>

    {/* SIGNATURE BLOCKS */}
    <div className="mx-8 mt-3 border border-black grid grid-cols-3 divide-x divide-black">
      <SigCol heading="APPRAISED BY:" subheading="Rater / Immediate Supervisor" block={appraisedBy} />
      <SigCol heading="REVIEWED BY:" subheading="Reviewing Supervisor / Division Head" block={reviewedBy} />
      <SigCol heading="REVIEWED WITH ME:" subheading="Ratee / Employee" block={reviewedWithMe} />
    </div>

    {/* CONCLUSIONS */}
    <div className="mx-8 mt-4 pt-3 border-t-2 border-black pb-4">
      <p className="text-center font-bold text-[12px]">
        CONCLUSIONS AND COMMENTS (CONFIDENTIAL:&nbsp; NOT TO BE SHOWN TO RATEE)
      </p>
      <p className="font-bold text-[12px] mt-2">
        STEP TWO:{" "}
        <span className="font-normal">Develop conclusion and comments</span>
      </p>
      <div className="text-[12px] mt-2 space-y-1">
        <p>
          1.&nbsp; If the overall rating is excellent or poor, explain why the employee was rated
          such or support rating with specific incidents.
        </p>
        <div className="border-b border-black h-5">{overallRatingExplanation}</div>
        <div className="border-b border-black h-5" />
      </div>
      <div className="text-[12px] mt-3 space-y-2">
        <p>2.&nbsp; Summarize the principal strengths and weakness of the employee.</p>
        <div className="flex gap-6">
          <div className="flex-1 flex items-baseline gap-1">
            <span className="whitespace-nowrap">Principal Strengths:</span>
            <span className="flex-1 border-b border-black px-1">{principalStrengths}</span>
          </div>
          <div className="flex-1 flex items-baseline gap-1">
            <span className="whitespace-nowrap">Principal Weakness:</span>
            <span className="flex-1 border-b border-black px-1">{principalWeakness}</span>
          </div>
        </div>
        <div className="flex items-baseline gap-1">
          <span className="whitespace-nowrap">
            To be more effective on present job the employee should:
          </span>
          <span className="flex-1 border-b border-black px-1">{effectivenessRecommendation}</span>
        </div>
      </div>
    </div>
  </div>
);

export default PerformanceEvaluationSheet;
