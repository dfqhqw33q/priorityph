import { createFileRoute } from "@tanstack/react-router";

import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";

import {
  EmptyState,
  ErrorState,
  LoadingState,
  PageHeader,
  StatusBadge,
} from "@/components/shared/portal-ui";
import { getMyPerformanceEvaluations } from "@/lib/performance-approval.functions";

export const Route = createFileRoute("/_authenticated/performance/history")({
  component: EmployeeEvaluationHistory,
});

function EmployeeEvaluationHistory() {
  const loadHistory = useServerFn(getMyPerformanceEvaluations);
  const query = useQuery({
    queryKey: ["my-performance-history"],
    queryFn: () => loadHistory({ data: {} }),
  });
  if (query.isPending) return <LoadingState label="Loading your evaluation history" />;
  if (query.isError) return <ErrorState message={query.error.message} />;
  return (
    <div className="space-y-6">
      <PageHeader
        breadcrumbs={["My Performance", "Evaluation History"]}
        title="Evaluation History"
        description="Review your completed evaluations and past results."
      />
      {query.data.length ? (
        <div className="overflow-x-auto rounded-xl border border-border bg-card">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead className="border-b border-border text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-4 py-3">Reference / Cycle</th>
                <th className="px-4 py-3">Employee score</th>
                <th className="px-4 py-3">Supervisor score</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Finalized</th>
                <th className="px-4 py-3">Result</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {query.data.map((evaluation) => (
                <tr key={evaluation.id}>
                  <td className="px-4 py-3">
                    <p className="font-medium">{evaluation.reference}</p>
                    <p className="text-xs text-muted-foreground">{evaluation.periodName}</p>
                  </td>
                  <td className="px-4 py-3">{formatScore(evaluation.employeeScore)}</td>
                  <td className="px-4 py-3">{formatScore(evaluation.supervisorScore)}</td>
                  <td className="px-4 py-3">
                    <StatusBadge>{evaluation.status.replaceAll("_", " ")}</StatusBadge>
                  </td>
                  <td className="px-4 py-3">
                    {evaluation.finalizedAt
                      ? new Date(evaluation.finalizedAt).toLocaleDateString()
                      : "—"}
                  </td>
                  <td className="px-4 py-3">
                    <a
                      className="font-medium text-primary hover:underline"
                      href={`/performance/results/${evaluation.id}`}
                    >
                      View
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <EmptyState
          title="No evaluation history yet"
          description="Your evaluation records will appear here."
        />
      )}
    </div>
  );
}

function formatScore(score: number | null): string {
  return score === null ? "—" : `${Number(score).toFixed(2)} / 5.00`;
}
