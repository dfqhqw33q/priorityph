import { createFileRoute } from "@tanstack/react-router";

import { PerformanceApprovalDetail } from "@/features/performance-management/components/performance-approval-detail";

export const Route = createFileRoute("/_authenticated/department/review/$evaluationId")({
  component: DepartmentEvaluationReviewPage,
});

function DepartmentEvaluationReviewPage() {
  const { evaluationId } = Route.useParams();
  return <PerformanceApprovalDetail evaluationId={evaluationId} lane="DEPARTMENT" />;
}
