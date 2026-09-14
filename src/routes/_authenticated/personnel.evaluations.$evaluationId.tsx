import { createFileRoute } from "@tanstack/react-router";
import { EvaluationStageDetail } from "@/features/performance-management/components/evaluation-stage-detail";
export const Route = createFileRoute("/_authenticated/personnel/evaluations/$evaluationId")({
  component: function PersonnelEvaluationRoute() {
    const { evaluationId } = Route.useParams();
    return <EvaluationStageDetail stage="PERSONNEL" evaluationId={evaluationId} />;
  },
});
