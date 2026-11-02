import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";

import { ErrorState, LoadingState, PageHeader } from "@/components/shared/portal-ui";
import { SupervisorEvaluationList } from "@/features/performance-management/components/supervisor-evaluation-list";
import { getSupervisorEvaluations } from "@/lib/portal.functions";

export const Route = createFileRoute("/_authenticated/team/evaluations")({
  component: EmployeeEvaluationsPage,
});

function EmployeeEvaluationsPage() {
  const loadEvaluations = useServerFn(getSupervisorEvaluations);
  const query = useQuery({
    queryKey: ["supervisor-evaluations"],
    queryFn: () => loadEvaluations(),
  });

  if (query.isPending) return <LoadingState label="Loading your employee evaluations" />;
  if (query.isError) return <ErrorState message={query.error.message} />;

  return (
    <div className="space-y-6">
      <PageHeader
        breadcrumbs={["Performance Management", "Employee Evaluations"]}
        title="Employee Evaluations"
        description="Review employee self-evaluations assigned to you."
      />
      <SupervisorEvaluationList
        evaluations={query.data}
        emptyTitle="No employee evaluations available"
        emptyDescription="Evaluations for employees assigned to you will appear here."
      />
    </div>
  );
}
