import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";
import { listPhase2Queue } from "@/lib/phase2.functions";
import { Button } from "@/components/ui/button";
import { EmptyState, LoadingBlock, PageHeader } from "@/components/ui-bits";

type Stage = "REVIEWING_SUPERVISOR" | "PERSONNEL" | "COMMITTEE" | "PRESIDENT";
const titles: Record<Stage, string> = { REVIEWING_SUPERVISOR: "Reviewing Supervisor queue", PERSONNEL: "Personnel processing queue", COMMITTEE: "Committee review queue", PRESIDENT: "President approval queue" };

export function Phase2QueuePage({ stage }: { stage: Stage }) {
  const fetchQueue = useServerFn(listPhase2Queue);
  const query = useQuery({ queryKey: ["phase2-queue", stage], queryFn: () => fetchQueue({ data: { stage } }), retry: false });
  const detailPath = stage === "REVIEWING_SUPERVISOR" ? "/reviewing-supervisor/evaluations/$evaluationId" : stage === "PERSONNEL" ? "/personnel/evaluations/$evaluationId" : stage === "COMMITTEE" ? "/committee/evaluations/$evaluationId" : "/president/approvals/$evaluationId";
  return <div className="space-y-6"><PageHeader title={titles[stage]} description="Evaluations available for the current workflow stage." />{query.isLoading ? <LoadingBlock rows={5} /> : query.isError ? <EmptyState title="Queue unavailable" description={query.error instanceof Error ? query.error.message : "Unable to load the queue"} /> : (query.data ?? []).length === 0 ? <EmptyState title="No evaluations in this stage" description="New evaluations appear after the preceding stage is submitted." /> : <div className="overflow-x-auto rounded-xl border border-border bg-card shadow-sm"><table className="w-full min-w-[680px] text-left text-sm"><caption className="sr-only">{titles[stage]}</caption><thead className="border-b border-border bg-muted/60"><tr><th className="px-4 py-3 font-semibold">Employee</th><th className="px-4 py-3 font-semibold">Employee number</th><th className="px-4 py-3 font-semibold">Cycle</th><th className="px-4 py-3 font-semibold">Status</th><th className="px-4 py-3 text-right font-semibold">Action</th></tr></thead><tbody>{(query.data ?? []).map((row) => <tr key={row.id} className="border-b last:border-0"><td className="px-4 py-3 font-medium">{row.full_name_snapshot}</td><td className="px-4 py-3 tabular-nums">{row.employee_number_snapshot}</td><td className="px-4 py-3">{row.cycle_year}</td><td className="px-4 py-3">{row.status}</td><td className="px-4 py-3 text-right"><Button asChild variant="outline" size="sm"><Link to={detailPath as never} params={{ evaluationId: row.id } as never}>Open</Link></Button></td></tr>)}</tbody></table></div>}</div>;
}
