import { createFileRoute } from "@tanstack/react-router";
import { EvaluationStageDetail } from "@/features/performance-management/components/evaluation-stage-detail";

export const Route = createFileRoute("/_authenticated/president/drafts/$evaluationId")({
  component: function PresidentDraftRoute() {
    const { evaluationId } = Route.useParams();
    return <EvaluationStageDetail stage="PRESIDENT" evaluationId={evaluationId} />;
  },
});
