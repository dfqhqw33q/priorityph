import { createFileRoute } from "@tanstack/react-router";
import { Phase2StageDetail } from "@/components/phase2-stage-detail";
export const Route = createFileRoute("/_authenticated/committee/evaluations/$evaluationId")({ component: () => <Phase2StageDetail stage="COMMITTEE" evaluationId={Route.useParams().evaluationId} /> });
