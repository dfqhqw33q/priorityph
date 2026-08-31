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
  <div className="flex items-center gap-1 min-w-0">
    <span className="font-bold text-[12px] uppercase tracking-tight whitespace-nowrap">{label}</span>
    <span className="flex-1 min-w-0 border-b border-black text-[12px] px-1 pb-0.5">{value || " "}</span>
  </div>
);

const SigCol: React.FC<{ heading: string; subheading: string; block: SignatureBlock }> = ({ heading, subheading, block }) => (
  <div className="flex flex-col px-3 pt-2 pb-2">
    <span className="font-bold uppercase text-[11px] mb-1">{heading}</span>
    <span className="text-[10px] mb-6">{subheading}</span>
    <div className="relative h-[52px] flex items-center justify-center border-b border-black mb-1">
      {block.signatureImageSrc ? (
        <img src={block.signatureImageSrc} alt={`Signature of ${block.name}`} className="max-h-[42px] object-contain" />
      ) : null}
    </div>
    <span className="text-center font-bold text-[11px] leading-tight">{block.name || "—"}</span>
    <span className="text-center text-[10px] leading-tight">{block.jobTitle || "—"}</span>
    <div className="flex items-center gap-1 mt-4 text-[11px]">
      <span className="font-bold">Date:</span>
      <span className="flex-1 border-b border-black text-center px-1">{block.date || "—"}</span>
    </div>
  </div>
);

export const PerformanceEvaluationSheet: React.FC<PerformanceEvaluationSheetProps> = ({
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
  <div className="w-[794px] mx-auto bg-white text-black font-sans text-[12px]">
    <main className="max-w-[760px] mx-auto bg-white p-6 md:p-10" data-purpose="evaluation-form-container">
      <header className="mb-6" data-purpose="form-header">
        <h1 className="text-[18px] font-extrabold uppercase leading-tight">{companyName}</h1>
        <p className="text-[11px]">{companyAddress}</p>
        <div className="text-center mt-6 mb-8">
          <h2 className="text-[16px] font-extrabold uppercase">PERFORMANCE EVALUATION SHEET</h2>
          <h3 className="text-[14px] font-extrabold uppercase">FOR NON-SUPERVISORY STAFF</h3>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-4 mb-6">
          <div className="flex items-center">
            <span className="w-40 font-semibold">PERIOD COVERED:</span>
            <span className="mr-2">FROM</span>
            <span className="border-b border-black flex-grow text-center px-2">{periodFrom}</span>
            <span className="mx-2">TO</span>
            <span className="border-b border-black flex-grow text-center px-2">{periodTo}</span>
          </div>
          <div />
          <div className="flex items-center">
            <span className="w-40 font-semibold uppercase">Name of Ratee:</span>
            <span className="border-b border-black flex-grow px-2">{nameOfRatee}</span>
          </div>
          <div className="flex items-center">
            <span className="w-40 font-semibold uppercase">Job Title of Ratee:</span>
            <span className="border-b border-black flex-grow px-2">{jobTitleOfRatee}</span>
          </div>
          <div className="flex items-center">
            <span className="w-40 font-semibold uppercase">Division/Dept:</span>
            <span className="border-b border-black flex-grow px-2">{division}</span>
          </div>
          <div className="flex items-center">
            <span className="w-40 font-semibold uppercase">Section/Unit:</span>
            <span className="border-b border-black flex-grow px-2">{sectionUnit}</span>
          </div>
          <div className="flex items-center">
            <span className="w-40 font-semibold uppercase">Name of Rater:</span>
            <span className="border-b border-black flex-grow px-2">{nameOfRater}</span>
          </div>
          <div className="flex items-center">
            <span className="w-40 font-semibold uppercase">Job Title of Rater:</span>
            <span className="border-b border-black flex-grow px-2">{jobTitleOfRater}</span>
          </div>
        </div>
      </header>

      <div className="border border-black p-2 mb-4 flex justify-between font-semibold text-[11px]">
        <span>RATING:</span>
        <span>1 - Poor</span>
        <span>2 - Below Average</span>
        <span>3 - Average</span>
        <span>4 - Above Average</span>
        <span>5 - Excellent</span>
      </div>

      <div className="overflow-x-auto mb-8" data-purpose="evaluation-table-container">
        <table className="w-full text-left border-collapse border border-black">
          <thead>
            <tr className="bg-[#d4d4d4] uppercase text-center text-[11px] font-bold leading-tight">
              <th className="border border-black p-2 w-[55%]">Performance Evaluation Factor</th>
              <th className="border border-black p-2 bg-[#dce8ff]">Employee / Ratee<br /><span className="text-[10px] font-normal capitalize">(Self Rating)</span></th>
              <th className="border border-black p-2 bg-[#dff3df]">Supervisor / Rater<br /><span className="text-[10px] font-normal capitalize">(Rating)</span></th>
              <th className="border border-black p-2 bg-[#f9e8cf]">Reviewing Supervisor /<br />Division Head<br /><span className="text-[10px] font-normal capitalize">(Rating)</span></th>
            </tr>
          </thead>
          <tbody>
            {factors.map((factor) => (
              <tr key={factor.letter}>
                <td className="border border-black p-3 align-top">
                  <div className="flex gap-2">
                    <span className="font-bold">{factor.letter}.</span>
                    <div>
                      <span className="font-bold uppercase">{factor.title}.</span> {factor.description}
                    </div>
                  </div>
                </td>
                <td className="border border-black p-3 text-center font-bold text-[20px]">{factor.employeeSelfRating}</td>
                <td className="border border-black p-3 text-center font-bold text-[20px]">{factor.supervisorRating}</td>
                <td className="border border-black p-3 text-center font-bold text-[20px]">{factor.reviewingSupervisorRating}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-8" data-purpose="signatures-section">
        <div className="flex flex-col">
          <span className="font-bold uppercase text-[11px] mb-1">APPRAISED BY:</span>
          <span className="text-[10px] mb-6">Rater / Immediate Supervisor</span>
          <div className="relative h-16 flex items-center justify-center border-b border-black mb-1">
            {appraisedBy.signatureImageSrc ? (
              <img src={appraisedBy.signatureImageSrc} alt={`Signature of ${appraisedBy.name}`} className="max-h-[42px] object-contain" />
            ) : null}
          </div>
          <span className="text-center font-bold text-[12px]">{appraisedBy.name || "—"}</span>
          <span className="text-center text-[10px]">{appraisedBy.jobTitle || "—"}</span>
          <div className="flex mt-4 items-center">
            <span className="mr-2 text-[11px]">Date:</span>
            <span className="border-b border-black flex-grow text-center text-[11px]">{appraisedBy.date || "—"}</span>
          </div>
        </div>

        <div className="flex flex-col">
          <span className="font-bold uppercase text-[11px] mb-1">REVIEWED BY:</span>
          <span className="text-[10px] mb-6">Reviewing Supervisor / Division Head</span>
          <div className="relative h-16 flex items-center justify-center border-b border-black mb-1">
            {reviewedBy.signatureImageSrc ? (
              <img src={reviewedBy.signatureImageSrc} alt={`Signature of ${reviewedBy.name}`} className="max-h-[42px] object-contain" />
            ) : null}
          </div>
          <span className="text-center font-bold text-[12px]">{reviewedBy.name || "—"}</span>
          <span className="text-center text-[10px]">{reviewedBy.jobTitle || "—"}</span>
          <div className="flex mt-4 items-center">
            <span className="mr-2 text-[11px]">Date:</span>
            <span className="border-b border-black flex-grow text-center text-[11px]">{reviewedBy.date || "—"}</span>
          </div>
        </div>

        <div className="flex flex-col">
          <span className="font-bold uppercase text-[11px] mb-1">REVIEWED WITH ME:</span>
          <span className="text-[10px] mb-6">Ratee / Employee</span>
          <div className="relative h-16 flex items-center justify-center border-b border-black mb-1">
            {reviewedWithMe.signatureImageSrc ? (
              <img src={reviewedWithMe.signatureImageSrc} alt={`Signature of ${reviewedWithMe.name}`} className="max-h-[42px] object-contain" />
            ) : null}
          </div>
          <span className="text-center font-bold text-[12px]">{reviewedWithMe.name || "—"}</span>
          <span className="text-center text-[10px]">{reviewedWithMe.jobTitle || "—"}</span>
          <div className="flex mt-4 items-center">
            <span className="mr-2 text-[11px]">Date:</span>
            <span className="border-b border-black flex-grow text-center text-[11px]">{reviewedWithMe.date || "—"}</span>
          </div>
        </div>
      </div>

      <div className="border-t border-black pt-4" data-purpose="conclusions-section">
        <h4 className="text-center font-bold mb-4 text-[12px]">CONCLUSIONS AND COMMENTS (CONFIDENTIAL: NOT TO BE SHOWN TO RATEE)</h4>
        <div className="mb-4 text-[12px]">
          <span className="font-bold uppercase">STEP TWO:</span> Develop conclusion and comments
        </div>
        <div className="mb-6 text-[12px]">
          <p className="mb-2">1. If the overall rating is excellent or poor, explain why the employee was rated such or support rating with specific incidents.</p>
          <div className="border-b border-black w-full h-6 mb-2">{overallRatingExplanation}</div>
          <div className="border-b border-black w-full h-6" />
        </div>
        <div className="text-[12px]">
          <p className="mb-2">2. Summarize the principal strengths and weakness of the employee.</p>
          <div className="flex gap-4 mb-2">
            <span className="w-32">Principal Strengths:</span>
            <div className="border-b border-black flex-grow min-h-[20px]">{principalStrengths}</div>
            <span className="w-32">Principal Weakness:</span>
            <div className="border-b border-black flex-grow min-h-[20px]">{principalWeakness}</div>
          </div>
          <div className="flex items-center">
            <span className="mr-2">To be more effective on present job the employee should:</span>
            <div className="border-b border-black flex-grow min-h-[20px]">{effectivenessRecommendation}</div>
          </div>
        </div>
      </div>
    </main>
  </div>
);

export default PerformanceEvaluationSheet;
