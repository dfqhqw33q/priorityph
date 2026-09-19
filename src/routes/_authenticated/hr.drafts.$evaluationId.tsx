import { createFileRoute, useParams } from "@tanstack/react-router";
import { HistoryDetailPage } from "./hr.evaluation-history.$evaluationId";

export const Route = createFileRoute("/_authenticated/hr/drafts/$evaluationId")({
  component: function HrDraftRoute() {
    const { evaluationId } = useParams({ from: "/_authenticated/hr/drafts/$evaluationId" });
    return <HistoryDetailPage evaluationId={evaluationId} />;
  },
});
