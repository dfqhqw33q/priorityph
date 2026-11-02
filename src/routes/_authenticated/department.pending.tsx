import { createFileRoute } from "@tanstack/react-router";

import { PerformanceApprovalQueue } from "@/features/performance-management/components/performance-approval-queue";

export const Route = createFileRoute("/_authenticated/department/pending")({
  component: () => (
    <PerformanceApprovalQueue
      lane="DEPARTMENT_PENDING"
      title="Pending Performance Approvals"
      description="Review and decide on supervisor-submitted evaluations."
      department
    />
  ),
});
