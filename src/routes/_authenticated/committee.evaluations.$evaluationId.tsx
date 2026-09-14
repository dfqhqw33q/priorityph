import { createFileRoute } from "@tanstack/react-router";
import { EvaluationStageDetail } from "@/features/performance-management/components/evaluation-stage-detail";
export const Route = createFileRoute("/_authenticated/committee/evaluations/$evaluationId")({
  component: () => (
    <EvaluationStageDetail stage="COMMITTEE" evaluationId={Route.useParams().evaluationId} />
  ),
});
