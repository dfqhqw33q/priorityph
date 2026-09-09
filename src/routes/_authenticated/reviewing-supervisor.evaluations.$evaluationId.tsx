import { createFileRoute } from "@tanstack/react-router";
import { EvaluationStageDetail } from "@/features/performance-management/components/evaluation-stage-detail";
export const Route = createFileRoute("/_authenticated/reviewing-supervisor/evaluations/$evaluationId")({ component: () => <EvaluationStageDetail stage="REVIEWING_SUPERVISOR" evaluationId={Route.useParams().evaluationId} /> });
