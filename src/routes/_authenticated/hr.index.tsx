import { createFileRoute } from "@tanstack/react-router";

import { PerformanceApprovalQueue } from "@/features/performance-management/components/performance-approval-queue";

export const Route = createFileRoute("/_authenticated/hr/")({
  component: () => (
    <PerformanceApprovalQueue
      lane="HR_PENDING"
      title="HR Administrator Dashboard"
      description="Review evaluations in the HR validation stage."
    />
  ),
});
