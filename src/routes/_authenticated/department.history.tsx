import { createFileRoute } from "@tanstack/react-router";

import { PerformanceApprovalQueue } from "@/features/performance-management/components/performance-approval-queue";

export const Route = createFileRoute("/_authenticated/department/history")({
  component: () => (
    <PerformanceApprovalQueue
      lane="DEPARTMENT_HISTORY"
      title="Department Evaluation History"
      description="Review performance workflow records for your authorized department."
      department
    />
  ),
});
