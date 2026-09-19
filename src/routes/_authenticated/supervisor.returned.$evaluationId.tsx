import { createFileRoute, useParams } from "@tanstack/react-router";
import { SupervisorReviewPage } from "./supervisor.evaluations.$evaluationId";

export const Route = createFileRoute("/_authenticated/supervisor/returned/$evaluationId")({
  component: function SupervisorReturnedRoute() {
    const { evaluationId } = useParams({
      from: "/_authenticated/supervisor/returned/$evaluationId",
    });
    return <SupervisorReviewPage evaluationId={evaluationId} />;
  },
});
