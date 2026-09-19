import { createFileRoute, useParams } from "@tanstack/react-router";
import { HistoryDetailPage } from "./hr.evaluation-history.$evaluationId";

export const Route = createFileRoute(
  "/_authenticated/reviewing-supervisor/completed/$evaluationId",
)({
  component: function ReviewingSupervisorCompletedRoute() {
    const { evaluationId } = useParams({
      from: "/_authenticated/reviewing-supervisor/completed/$evaluationId",
    });
    return <HistoryDetailPage evaluationId={evaluationId} />;
  },
});
