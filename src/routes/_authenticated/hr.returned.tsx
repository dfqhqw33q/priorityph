import { createFileRoute } from "@tanstack/react-router";

import { PerformanceApprovalQueue } from "@/features/performance-management/components/performance-approval-queue";

export const Route = createFileRoute("/_authenticated/hr/returned")({
  component: () => (
    <PerformanceApprovalQueue
      lane="HR_RETURNED"
      title="Returned for Correction"
      description="Track evaluations returned by HR and their correction status."
    />
  ),
});
