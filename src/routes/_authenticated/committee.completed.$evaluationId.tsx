import { createFileRoute, useParams } from "@tanstack/react-router";
import { HistoryDetailPage } from "./hr.evaluation-history.$evaluationId";

export const Route = createFileRoute("/_authenticated/committee/completed/$evaluationId")({
  component: function CommitteeCompletedRoute() {
    const { evaluationId } = useParams({
      from: "/_authenticated/committee/completed/$evaluationId",
    });
    return <HistoryDetailPage evaluationId={evaluationId} />;
  },
});
