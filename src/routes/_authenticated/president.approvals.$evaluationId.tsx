import { createFileRoute } from "@tanstack/react-router";
import { Phase2StageDetail } from "@/components/phase2-stage-detail";
export const Route = createFileRoute("/_authenticated/president/approvals/$evaluationId")({ component: () => <Phase2StageDetail stage="PRESIDENT" evaluationId={Route.useParams().evaluationId} /> });
