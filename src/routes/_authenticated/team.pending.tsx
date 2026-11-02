import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";

import { ErrorState, LoadingState, PageHeader } from "@/components/shared/portal-ui";
import { SupervisorEvaluationList } from "@/features/performance-management/components/supervisor-evaluation-list";
import { getSupervisorEvaluations } from "@/lib/portal.functions";

export const Route = createFileRoute("/_authenticated/team/pending")({
  component: PendingEvaluationsPage,
});

function PendingEvaluationsPage() {
  const loadEvaluations = useServerFn(getSupervisorEvaluations);
  const query = useQuery({
    queryKey: ["supervisor-evaluations"],
    queryFn: () => loadEvaluations(),
  });

  if (query.isPending) return <LoadingState label="Loading evaluations awaiting your review" />;
  if (query.isError) return <ErrorState message={query.error.message} />;

  const pendingEvaluations = query.data.filter((evaluation) =>
    [
      "SUBMITTED",
      "PENDING_SUPERVISOR_REVIEW",
      "SUPERVISOR_IN_PROGRESS",
      "RETURNED_BY_DEPARTMENT_HEAD",
      "RETURNED_BY_HR",
    ].includes(evaluation.status),
  );

  return (
    <div className="space-y-6">
      <PageHeader
        breadcrumbs={["Performance Management", "Pending Evaluations"]}
        title="Pending Evaluations"
        description="Track evaluations waiting for employee or supervisor action."
      />
      <SupervisorEvaluationList
        evaluations={pendingEvaluations}
        emptyTitle="No evaluations awaiting review"
        emptyDescription="Submitted self-evaluations from employees assigned to you will appear here."
      />
    </div>
  );
}
