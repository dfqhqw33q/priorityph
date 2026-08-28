import { createFileRoute } from "@tanstack/react-router";
import { Phase2StageDetail } from "@/components/phase2-stage-detail";
export const Route = createFileRoute("/_authenticated/reviewing-supervisor/evaluations/$evaluationId")({ component: () => <Phase2StageDetail stage="REVIEWING_SUPERVISOR" evaluationId={Route.useParams().evaluationId} /> });
