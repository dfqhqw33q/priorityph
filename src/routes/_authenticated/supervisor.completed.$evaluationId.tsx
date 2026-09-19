import { createFileRoute, useParams } from "@tanstack/react-router";
import { HistoryDetailPage } from "./hr.evaluation-history.$evaluationId";

export const Route = createFileRoute("/_authenticated/supervisor/completed/$evaluationId")({
  component: function SupervisorCompletedRoute() {
    const { evaluationId } = useParams({
      from: "/_authenticated/supervisor/completed/$evaluationId",
    });
    return <HistoryDetailPage evaluationId={evaluationId} />;
  },
});
