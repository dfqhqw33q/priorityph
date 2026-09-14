import { createFileRoute } from "@tanstack/react-router";
import { EvaluationStageDetail } from "@/features/performance-management/components/evaluation-stage-detail";
export const Route = createFileRoute(
  "/_authenticated/reviewing-supervisor/evaluations/$evaluationId",
)({
  component: function ReviewingSupervisorEvaluationRoute() {
    const { evaluationId } = Route.useParams();
    return <EvaluationStageDetail stage="REVIEWING_SUPERVISOR" evaluationId={evaluationId} />;
  },
});
