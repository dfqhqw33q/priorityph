import { createFileRoute } from "@tanstack/react-router";

import { EmptyState, PageHeader } from "@/components/shared/portal-ui";

export const Route = createFileRoute("/_authenticated/performance/current")({
  component: CurrentEvaluationPage,
});

function CurrentEvaluationPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        breadcrumbs={["My Performance", "Current Evaluation"]}
        title="Current Evaluation"
        description="Check the evaluation period currently assigned to you."
      />
      <EmptyState
        title="No current evaluation assigned"
        description="There is no active performance evaluation assigned to your employee profile."
        detail="When a period is assigned, its status and due date will appear here."
      />
    </div>
  );
}
