import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";

import { listEvaluationStageQueue } from "@/lib/evaluation-workflow.functions";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  EmptyState,
  EvaluationStatusBadge,
  LoadingBlock,
  PageHeader,
  formatDateTime,
} from "@/components/shared/shared-ui";
import type { EvaluationStatus } from "@/lib/domain";

type Stage = "REVIEWING_SUPERVISOR" | "PERSONNEL" | "COMMITTEE" | "PRESIDENT";
type QueueRow = {
  id: string;
  full_name_snapshot: string;
  employee_number_snapshot: string;
  job_title_snapshot: string;
  division_snapshot: string;
  section_snapshot: string;
  cycle_name: string;
  cycle_year: number;
  employee_submitted_at: string | null;
  status: string;
};
const titles: Record<Stage, string> = {
  REVIEWING_SUPERVISOR: "Reviewing Supervisor queue",
  PERSONNEL: "Personnel processing queue",
  COMMITTEE: "Committee review queue",
  PRESIDENT: "President approval queue",
};

export function EvaluationStageQueuePage({ stage }: { stage: Stage }) {
  const fetchQueue = useServerFn(listEvaluationStageQueue);
  const query = useQuery({
    queryKey: ["phase2-queue", stage],
    queryFn: () => fetchQueue({ data: { stage } }),
    retry: false,
  });
  const detailPath =
    stage === "REVIEWING_SUPERVISOR"
      ? "/reviewing-supervisor/evaluations/$evaluationId"
      : stage === "PERSONNEL"
        ? "/personnel/evaluations/$evaluationId"
        : stage === "COMMITTEE"
          ? "/committee/evaluations/$evaluationId"
          : "/president/evaluations/$evaluationId";
  return (
    <div className="space-y-6">
      <PageHeader
        title={titles[stage]}
        description={
          stage === "REVIEWING_SUPERVISOR"
            ? "Complete the division-level review for submitted evaluations."
            : stage === "PERSONNEL"
              ? "Complete the personnel details before committee review."
              : stage === "COMMITTEE"
                ? "Review evaluations and recommend the appropriate action."
                : "Review evaluations and make the final approval decision."
        }
      />
      {query.isLoading ? (
        <LoadingBlock rows={5} />
      ) : query.isError ? (
        <EmptyState
          title="Queue unavailable"
          description={
            query.error instanceof Error ? query.error.message : "Unable to load the queue"
          }
        />
      ) : (query.data ?? []).length === 0 ? (
        <EmptyState
          title="No evaluations in this stage"
          description="New evaluations appear after the preceding stage is submitted."
        />
      ) : (
        <div className="max-w-full border border-border bg-card shadow-sm">
          <Table className="w-full min-w-[1180px] table-fixed">
            <caption className="sr-only">{titles[stage]}</caption>
            <TableHeader>
              <TableRow>
                <TableHead className="min-w-[120px] whitespace-nowrap">Employee ID</TableHead>
                <TableHead className="min-w-[190px]">Full Name</TableHead>
                <TableHead className="min-w-[150px]">Job Title</TableHead>
                <TableHead className="min-w-[170px]">Division / Department</TableHead>
                <TableHead className="min-w-[150px]">Section / Unit</TableHead>
                <TableHead className="min-w-[240px]">Cycle</TableHead>
                <TableHead className="min-w-[190px] whitespace-nowrap">Date Submitted</TableHead>
                <TableHead className="min-w-[120px] whitespace-nowrap">Status</TableHead>
                <TableHead className="text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {((query.data ?? []) as QueueRow[]).map((row) => (
                <TableRow key={row.id}>
                  <TableCell className="whitespace-nowrap tabular-nums">
                    {row.employee_number_snapshot}
                  </TableCell>
                  <TableCell>
                    <Link
                      className="font-normal text-foreground transition-colors hover:text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                      to={detailPath as never}
                      params={{ evaluationId: row.id } as never}
                    >
                      {row.full_name_snapshot}
                    </Link>
                  </TableCell>
                  <TableCell>{row.job_title_snapshot || "—"}</TableCell>
                  <TableCell>{row.division_snapshot || "—"}</TableCell>
                  <TableCell>{row.section_snapshot || "—"}</TableCell>
                  <TableCell>
                    {row.cycle_name ? `${row.cycle_name} (${row.cycle_year})` : row.cycle_year}
                  </TableCell>
                  <TableCell className="whitespace-nowrap">
                    {row.employee_submitted_at ? formatDateTime(row.employee_submitted_at) : "—"}
                  </TableCell>
                  <TableCell>
                    <EvaluationStatusBadge status={row.status as EvaluationStatus} />
                  </TableCell>
                  <TableCell className="text-right">
                    <Button asChild variant="outline" size="sm">
                      <Link to={detailPath as never} params={{ evaluationId: row.id } as never}>
                        Open
                      </Link>
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
