import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";

import { ErrorState, LoadingState, PageHeader } from "@/components/shared/portal-ui";
import { SupervisorEvaluationList } from "@/features/performance-management/components/supervisor-evaluation-list";
import { getSupervisorEvaluations } from "@/lib/portal.functions";

export const Route = createFileRoute("/_authenticated/team/history")({
  component: TeamEvaluationHistoryPage,
});

function TeamEvaluationHistoryPage() {
  const loadEvaluations = useServerFn(getSupervisorEvaluations);
  const query = useQuery({
    queryKey: ["supervisor-evaluations"],
    queryFn: () => loadEvaluations(),
  });
  if (query.isPending) return <LoadingState label="Loading evaluation history" />;
  if (query.isError) return <ErrorState message={query.error.message} />;
  const evaluations = query.data.filter((evaluation) => evaluation.submittedAt !== null);

  return (
    <div className="space-y-6">
      <PageHeader
        breadcrumbs={["Performance Management", "Evaluation History"]}
        title="Evaluation History"
        description="Review submitted evaluation records for employees assigned to you."
      />
      <SupervisorEvaluationList
        evaluations={evaluations}
        emptyTitle="No evaluation history yet"
        emptyDescription="Submitted evaluations for your assigned employees will appear here."
      />
    </div>
  );
}
