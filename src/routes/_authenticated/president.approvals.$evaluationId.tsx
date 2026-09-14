import { createFileRoute } from "@tanstack/react-router";
import { EvaluationStageDetail } from "@/features/performance-management/components/evaluation-stage-detail";
export const Route = createFileRoute("/_authenticated/president/approvals/$evaluationId")({
  component: function PresidentApprovalRoute() {
    const { evaluationId } = Route.useParams();
    return <EvaluationStageDetail stage="PRESIDENT" evaluationId={evaluationId} />;
  },
});
