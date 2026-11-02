import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";

import { ErrorState, LoadingState, PageHeader } from "@/components/shared/portal-ui";
import { SupervisorEvaluationList } from "@/features/performance-management/components/supervisor-evaluation-list";
import { getSupervisorEvaluations } from "@/lib/portal.functions";

export const Route = createFileRoute("/_authenticated/team/completed")({
  component: CompletedEvaluationsPage,
});

const COMPLETED_STATUSES = [
  "COMPLETED",
  "SUPERVISOR_SUBMITTED",
  "PENDING_DEPARTMENT_HEAD_APPROVAL",
  "RETURNED_BY_DEPARTMENT_HEAD",
  "PENDING_HR_VALIDATION",
  "RETURNED_BY_HR",
  "FINALIZED",
];

function CompletedEvaluationsPage() {
  const loadEvaluations = useServerFn(getSupervisorEvaluations);
  const query = useQuery({
    queryKey: ["supervisor-evaluations"],
    queryFn: () => loadEvaluations(),
  });
  if (query.isPending) return <LoadingState label="Loading completed evaluations" />;
  if (query.isError) return <ErrorState message={query.error.message} />;
  const evaluations = query.data.filter((evaluation) =>
    COMPLETED_STATUSES.includes(evaluation.status),
  );

  return (
    <div className="space-y-6">
      <PageHeader
        breadcrumbs={["Performance Management", "Completed Evaluations"]}
        title="Completed Evaluations"
        description="Review submitted Supervisor assessments, evaluations in approval, and finalized results."
      />
      <SupervisorEvaluationList
        evaluations={evaluations}
        emptyTitle="No completed evaluations"
        emptyDescription="Submitted assessments and finalized evaluations assigned to you will appear here."
      />
    </div>
  );
}
