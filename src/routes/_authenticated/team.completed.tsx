import { createFileRoute } from "@tanstack/react-router";

import { EmptyState, PageHeader } from "@/components/shared/portal-ui";

export const Route = createFileRoute("/_authenticated/team/completed")({
  component: CompletedEvaluationsPage,
});

function CompletedEvaluationsPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        breadcrumbs={["Performance Management", "Completed Evaluations"]}
        title="Completed Evaluations"
        description="Access completed employee and supervisor evaluations."
      />
      <EmptyState
        title="No completed evaluations"
        description="Completed evaluations will be available after the Phase 2 evaluation workflow is implemented."
      />
    </div>
  );
}
