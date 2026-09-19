import { createFileRoute, useParams } from "@tanstack/react-router";
import { HistoryDetailPage } from "./hr.evaluation-history.$evaluationId";

export const Route = createFileRoute("/_authenticated/president/completed/$evaluationId")({
  component: function PresidentCompletedRoute() {
    const { evaluationId } = useParams({
      from: "/_authenticated/president/completed/$evaluationId",
    });
    return <HistoryDetailPage evaluationId={evaluationId} />;
  },
});
