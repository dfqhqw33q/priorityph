import { createFileRoute } from "@tanstack/react-router";

import { PerformanceApprovalQueue } from "@/features/performance-management/components/performance-approval-queue";

export const Route = createFileRoute("/_authenticated/department/performance")({
  component: () => (
    <PerformanceApprovalQueue
      lane="DEPARTMENT_PENDING"
      title="Department Performance"
      description="Review pending approvals and monitor evaluation status for your assigned department."
      department
    />
  ),
});
