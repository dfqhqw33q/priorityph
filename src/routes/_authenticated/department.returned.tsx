import { createFileRoute } from "@tanstack/react-router";

import { PerformanceApprovalQueue } from "@/features/performance-management/components/performance-approval-queue";

export const Route = createFileRoute("/_authenticated/department/returned")({
  component: () => (
    <PerformanceApprovalQueue
      lane="DEPARTMENT_RETURNED"
      title="Returned Evaluations"
      description="Track evaluations returned to supervisors for correction."
      department
    />
  ),
});
