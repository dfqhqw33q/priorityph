import { createFileRoute } from "@tanstack/react-router";

import { PerformanceApprovalQueue } from "@/features/performance-management/components/performance-approval-queue";

export const Route = createFileRoute("/_authenticated/department/")({
  component: () => (
    <PerformanceApprovalQueue
      lane="DEPARTMENT_PENDING"
      title="Department Dashboard"
      description="Review evaluations submitted by supervisors for your authorized department."
      department
    />
  ),
});
