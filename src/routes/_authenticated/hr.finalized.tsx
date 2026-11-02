import { createFileRoute } from "@tanstack/react-router";

import { PerformanceApprovalQueue } from "@/features/performance-management/components/performance-approval-queue";

export const Route = createFileRoute("/_authenticated/hr/finalized")({
  component: () => (
    <PerformanceApprovalQueue
      lane="HR_FINALIZED"
      title="Finalized Evaluations"
      description="View finalized evaluation records and their approval history."
    />
  ),
});
