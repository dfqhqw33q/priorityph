import { createFileRoute } from "@tanstack/react-router";
import { EvaluationStageDetail } from "@/features/performance-management/components/evaluation-stage-detail";

export const Route = createFileRoute("/_authenticated/reviewing-supervisor/drafts/$evaluationId")({
  component: function ReviewingSupervisorDraftRoute() {
    const { evaluationId } = Route.useParams();
    return <EvaluationStageDetail stage="REVIEWING_SUPERVISOR" evaluationId={evaluationId} />;
  },
});
