import { createFileRoute } from "@tanstack/react-router";
import { Phase2StageDetail } from "@/components/phase2-stage-detail";
export const Route = createFileRoute("/_authenticated/personnel/evaluations/$evaluationId")({ component: () => <Phase2StageDetail stage="PERSONNEL" evaluationId={Route.useParams().evaluationId} /> });
