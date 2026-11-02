import { createFileRoute } from "@tanstack/react-router";

import { EmptyState, PageHeader } from "@/components/shared/portal-ui";

export const Route = createFileRoute("/_authenticated/team/evaluations")({
  component: EmployeeEvaluationsPage,
});

function EmployeeEvaluationsPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        breadcrumbs={["Performance Management", "Employee Evaluations"]}
        title="Employee Evaluations"
        description="Review employee self-evaluations assigned to you."
      />
      <EmptyState
        title="No employee evaluations available"
        description="Employee evaluation records will appear here after the Phase 2 evaluation workflow is implemented."
      />
    </div>
  );
}
