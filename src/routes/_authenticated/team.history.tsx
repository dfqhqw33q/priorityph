import { createFileRoute } from "@tanstack/react-router";

import { EmptyState, PageHeader } from "@/components/shared/portal-ui";

export const Route = createFileRoute("/_authenticated/team/history")({
  component: TeamEvaluationHistoryPage,
});

function TeamEvaluationHistoryPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        breadcrumbs={["Performance Management", "Evaluation History"]}
        title="Evaluation History"
        description="Review historical evaluations for your assigned employees."
      />
      <EmptyState
        title="No evaluation history yet"
        description="Evaluation history will be available after the Phase 2 evaluation workflow is implemented."
      />
    </div>
  );
}
