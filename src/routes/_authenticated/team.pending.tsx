import { createFileRoute } from "@tanstack/react-router";

import { EmptyState, PageHeader } from "@/components/shared/portal-ui";

export const Route = createFileRoute("/_authenticated/team/pending")({
  component: PendingEvaluationsPage,
});

function PendingEvaluationsPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        breadcrumbs={["Performance Management", "Pending Evaluations"]}
        title="Pending Evaluations"
        description="Track evaluations waiting for employee or supervisor action."
      />
      <EmptyState
        title="No pending evaluations"
        description="Evaluation assignments and pending statuses will be available when the Phase 2 evaluation workflow is implemented."
      />
    </div>
  );
}
