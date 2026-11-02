import { createFileRoute } from "@tanstack/react-router";

import { PerformanceApprovalQueue } from "@/features/performance-management/components/performance-approval-queue";

export const Route = createFileRoute("/_authenticated/hr/approvals")({
  component: () => (
    <PerformanceApprovalQueue
      lane="HR_PENDING"
      title="Pending HR Validation"
      description="Validate approved evaluations before finalization."
    />
  ),
});
