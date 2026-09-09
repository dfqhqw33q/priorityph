import { createFileRoute } from "@tanstack/react-router";
import { EvaluationStageDetail } from "@/features/performance-management/components/evaluation-stage-detail";
export const Route = createFileRoute("/_authenticated/personnel/evaluations/$evaluationId")({ component: () => <EvaluationStageDetail stage="PERSONNEL" evaluationId={Route.useParams().evaluationId} /> });
