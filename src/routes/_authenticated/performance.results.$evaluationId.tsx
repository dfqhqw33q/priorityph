import { createFileRoute } from "@tanstack/react-router";

import { PerformanceApprovalDetail } from "@/features/performance-management/components/performance-approval-detail";

export const Route = createFileRoute("/_authenticated/performance/results/$evaluationId")({
  component: EmployeeEvaluationResultPage,
});

function EmployeeEvaluationResultPage() {
  const { evaluationId } = Route.useParams();
  return <PerformanceApprovalDetail evaluationId={evaluationId} lane="EMPLOYEE" />;
}
