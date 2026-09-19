import { createFileRoute, useParams } from "@tanstack/react-router";
import { HistoryDetailPage } from "./hr.evaluation-history.$evaluationId";

export const Route = createFileRoute("/_authenticated/hr/completed/$evaluationId")({
  component: function HrCompletedRoute() {
    const { evaluationId } = useParams({ from: "/_authenticated/hr/completed/$evaluationId" });
    return <HistoryDetailPage evaluationId={evaluationId} />;
  },
});
