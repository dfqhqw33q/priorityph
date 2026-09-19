import { createFileRoute, useParams } from "@tanstack/react-router";
import { HistoryDetailPage } from "./hr.evaluation-history.$evaluationId";

export const Route = createFileRoute("/_authenticated/hr/returned/$evaluationId")({
  component: function HrReturnedRoute() {
    const { evaluationId } = useParams({ from: "/_authenticated/hr/returned/$evaluationId" });
    return <HistoryDetailPage evaluationId={evaluationId} />;
  },
});
