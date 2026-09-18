import { createFileRoute } from "@tanstack/react-router";
import { EvaluationStageDetail } from "@/features/performance-management/components/evaluation-stage-detail";

export const Route = createFileRoute("/_authenticated/committee/drafts/$evaluationId")({
  component: function CommitteeDraftRoute() {
    const { evaluationId } = Route.useParams();
    return <EvaluationStageDetail stage="COMMITTEE" evaluationId={evaluationId} />;
  },
});
