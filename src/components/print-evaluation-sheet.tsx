import type { PresidentStepData } from "@/lib/domain";

type Criterion = { id: string; letter: string; title: string; description: string };
type Rating = { criterion_id: string; evaluator_type: string; rating: number };

export type PrintEvaluationData = {
  employeeNumber: string;
  fullName: string;
  jobTitle: string;
  division: string;
  section: string;
  cycleName: string;
  cycleYear: number;
  periodFrom?: string | null;
  periodTo?: string | null;
  raterName?: string | null;
  raterTitle?: string | null;
  supervisorRemarks: string;
  criteria: Criterion[];
  ratings: Rating[];
  finalScore: number | null;
  finalRatingLabel: string | null;
  step2: PresidentStepData | null;
  step3: PresidentStepData | null;
};

function ratingOf(ratings: Rating[], criterionId: string) {
  const president = ratings.find((r) => r.criterion_id === criterionId && r.evaluator_type === "PRESIDENT");
  if (president) return president.rating;
  const supervisor = ratings.find((r) => r.criterion_id === criterionId && r.evaluator_type === "SUPERVISOR");
  return supervisor ? supervisor.rating : null;
}

function formatDate(value?: string | null) {
  if (!value) return "";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toLocaleDateString();
}

function Line({ label, value }: { label: string; value: string }) {
  return (
    <p className="mb-1">
      <span className="font-semibold uppercase">{label}:</span>{" "}
      <span className="border-b border-black px-1">{value || "\u00a0".repeat(24)}</span>
    </p>
  );
}

/**
 * Faithful reproduction of the official "PERFORMANCE EVALUATION SHEET FOR
 * NON-SUPERVISORY STAFF" form. Rendered only when printing.
 */
export function PrintEvaluationSheet({ data }: { data: PrintEvaluationData }) {
  const stepItems = [...(data.step2?.items ?? []), ...(data.step3?.items ?? [])];
  const answers = { ...(data.step2?.answers ?? {}), ...(data.step3?.answers ?? {}) };

  return (
    <div className="hidden print:block print-sheet text-black">
      <style>{`@page { size: A4 portrait; margin: 12mm; }`}</style>

      <header className="text-center">
        <h1 className="text-base font-bold uppercase">Priority Handling Logistics, Inc.</h1>
        <p className="text-[11px]">1618-B Copernico St., San Isidro, Makati City</p>
        <h2 className="mt-3 text-sm font-bold uppercase">Performance Evaluation Sheet</h2>
        <p className="text-[11px] font-semibold uppercase">for Non-Supervisory Staff</p>
      </header>

      <section className="mt-3 text-[11px]">
        <p className="mb-2 font-semibold uppercase">
          Period Covered: From {formatDate(data.periodFrom) || `Jan 1, ${data.cycleYear}`} to{" "}
          {formatDate(data.periodTo) || `Dec 31, ${data.cycleYear}`} ({data.cycleName})
        </p>
        <div className="grid grid-cols-2 gap-x-6">
          <Line label="Name of Ratee" value={`${data.fullName} (${data.employeeNumber})`} />
          <Line label="Job Title of Ratee" value={data.jobTitle} />
          <Line label="Division/Dept" value={data.division} />
          <Line label="Section/Unit" value={data.section} />
          <Line label="Name of Rater" value={data.raterName ?? ""} />
          <Line label="Job Title of Rater" value={data.raterTitle ?? ""} />
        </div>
        <p className="mt-2 font-semibold">
          RATING: 1 – Poor 2 – Below Average 3 – Average 4 – Above Average 5 - Excellent
        </p>
      </section>

      <table className="mt-2 w-full border-collapse text-[11px]">
        <caption className="sr-only">Performance evaluation factors</caption>
        <thead>
          <tr>
            <th className="border border-black px-1 py-1 text-left" colSpan={2}>
              PERFORMANCE EVALUATION FACTOR
            </th>
            {[1, 2, 3, 4, 5].map((value) => (
              <th key={value} className="w-7 border border-black px-1 py-1 text-center">
                {value}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.criteria.map((criterion) => {
            const rating = ratingOf(data.ratings, criterion.id);
            return (
              <tr key={criterion.id}>
                <td className="w-6 border border-black px-1 py-1 align-top font-semibold">{criterion.letter}.</td>
                <td className="border border-black px-1 py-1 align-top">
                  <span className="font-bold uppercase">{criterion.title}.</span> {criterion.description}
                </td>
                {[1, 2, 3, 4, 5].map((value) => (
                  <td key={value} className="border border-black px-1 py-1 text-center align-middle font-bold">
                    {rating === value ? "X" : ""}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>

      <div className="mt-3 grid grid-cols-3 gap-4 text-[11px]">
        <div className="border-t border-black pt-1">APPRAISED BY: Rater</div>
        <div className="border-t border-black pt-1">REVIEWED BY: Reviewing Supv./ Div. Head</div>
        <div className="border-t border-black pt-1">REVIEWED WITH ME: Ratee</div>
      </div>

      <section className="mt-4 break-before-page text-[11px]">
        <h3 className="text-center text-sm font-bold uppercase">Conclusions and Comments</h3>
        <p className="text-center font-semibold">(CONFIDENTIAL: NOT TO BE SHOWN TO RATEE)</p>

        <h4 className="mt-3 font-bold uppercase">Step Two: Develop conclusion and comments</h4>
        <div className="space-y-2">
          {(data.step2?.items ?? []).map((item, index) => (
            <div key={item.id}>
              <p className="font-semibold">
                {index + 1}. {item.label}
              </p>
              <p className="min-h-6 whitespace-pre-wrap border-b border-black">{answers[item.id] ?? ""}</p>
            </div>
          ))}
        </div>

        <div className="mt-6 flex gap-8">
          <span className="border-t border-black pt-1">Signature of Rater</span>
          <span className="border-t border-black pt-1">Date</span>
        </div>

        <h4 className="mt-5 font-bold uppercase">Step Three: Reviewed by the Reviewing Supervisor</h4>
        <p className="font-semibold uppercase">Comments and recommendations of reviewing supervisor/division head</p>
        <div className="space-y-2">
          {(data.step3?.items ?? []).map((item) => (
            <div key={item.id}>
              <p className="font-semibold">{item.label}</p>
              <p className="min-h-6 whitespace-pre-wrap border-b border-black">{answers[item.id] ?? ""}</p>
            </div>
          ))}
          {stepItems.length === 0 ? (
            <p className="min-h-16 whitespace-pre-wrap border-b border-black">{data.supervisorRemarks}</p>
          ) : null}
        </div>

        <div className="mt-6 flex gap-8">
          <span className="border-t border-black pt-1">Signature of Reviewing Supervisor/Division Head</span>
          <span className="border-t border-black pt-1">Date</span>
        </div>
      </section>

      <section className="mt-6 break-before-page text-[11px]">
        <h3 className="font-bold uppercase">To be filled up by the Personnel Office</h3>
        <p className="mt-1">Employee&rsquo;s Present Salary : ______________________________________</p>
        <p>Date of Last Increase : ______________________________________</p>
        <p>Nature of Last Increase : ______________________________________</p>
        <p>Amount of Last Increase : ______________________________________</p>

        <h3 className="mt-4 font-bold uppercase">Performance Evaluation Result for this Period</h3>
        <p className="mt-1">
          TOTAL POINTS: <span className="font-bold">{data.finalScore?.toFixed(2) ?? "____________"}</span>{" "}
          &nbsp;&nbsp; ADJECTIVE RATING:{" "}
          <span className="font-bold">{data.finalRatingLabel ?? "____________"}</span>
        </p>
        <p>Recommended Increase / Bonus : ______________________________________</p>
        <p className="mt-1">Prepared by: ________________ Date: __________</p>

        <h3 className="mt-4 font-bold uppercase">
          Final action recommended by the Performance Evaluation Committee:
        </h3>
        <p>( ) Retain in Present Job</p>
        <p>( ) Transfer to : ____________________________________</p>
        <p>( ) Promote to : ____________________________________</p>
        <p>( ) Increase Salary by: _______________________________</p>
        <p>( ) Others (Training Required, etc.) ________________________</p>

        <div className="mt-6 grid grid-cols-2 gap-8">
          <div>
            <p>RECOMMENDED BY: ________________________</p>
            <p className="text-center">Performance Evaluation Committee Chairman</p>
            <p className="mt-2">DATE : ________________________</p>
          </div>
          <div>
            <p>APPROVED BY: ______________</p>
            <p className="text-center">President</p>
            <p className="mt-2">DATE : ____________</p>
          </div>
        </div>

        <p className="mt-4">
          &sup1; N.B. FOR SALES PERSONNEL: Indicate monthly history of: a. Number of Active Accounts b. Sales
          Production (domestic and International) Peso Value
        </p>
      </section>
    </div>
  );
}
