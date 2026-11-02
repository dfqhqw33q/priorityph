import { createFileRoute } from "@tanstack/react-router";

import { PerformanceApprovalDetail } from "@/features/performance-management/components/performance-approval-detail";

export const Route = createFileRoute("/_authenticated/hr/review/$evaluationId")({
  component: HrEvaluationReviewPage,
});

function HrEvaluationReviewPage() {
  const { evaluationId } = Route.useParams();
  return <PerformanceApprovalDetail evaluationId={evaluationId} lane="HR" />;
}
