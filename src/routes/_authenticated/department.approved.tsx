import { createFileRoute } from "@tanstack/react-router";

import { PerformanceApprovalQueue } from "@/features/performance-management/components/performance-approval-queue";

export const Route = createFileRoute("/_authenticated/department/approved")({
  component: () => (
    <PerformanceApprovalQueue
      lane="DEPARTMENT_APPROVED"
      title="Approved Evaluations"
      description="View evaluations approved by a Department Head and awaiting HR validation or already finalized."
      department
    />
  ),
});
