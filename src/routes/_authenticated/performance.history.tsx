import { createFileRoute } from "@tanstack/react-router";

import { EmptyState, PageHeader } from "@/components/shared/portal-ui";

export const Route = createFileRoute("/_authenticated/performance/history")({
  component: EmployeeEvaluationHistory,
});

function EmployeeEvaluationHistory() {
  return (
    <div className="space-y-6">
      <PageHeader
        breadcrumbs={["My Performance", "Evaluation History"]}
        title="Evaluation History"
        description="Review your completed evaluations and past results."
      />
      <EmptyState
        title="No evaluation history yet"
        description="Completed evaluations will be listed here after the new performance evaluation workflow is introduced."
      />
    </div>
  );
}
