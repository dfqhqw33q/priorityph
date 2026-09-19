import { createFileRoute, useParams } from "@tanstack/react-router";
import { SupervisorReviewPage } from "./supervisor.evaluations.$evaluationId";

export const Route = createFileRoute("/_authenticated/supervisor/drafts/$evaluationId")({
  component: function SupervisorDraftRoute() {
    const { evaluationId } = useParams({
      from: "/_authenticated/supervisor/drafts/$evaluationId",
    });
    return <SupervisorReviewPage evaluationId={evaluationId} />;
  },
});
