import { createFileRoute } from "@tanstack/react-router";
import { HistoryDetailPage } from "./hr.evaluation-history.$evaluationId";

export const Route = createFileRoute("/_authenticated/hr/drafts/$evaluationId")({
  component: HistoryDetailPage,
});
