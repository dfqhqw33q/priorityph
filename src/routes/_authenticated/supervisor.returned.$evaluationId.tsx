import { createFileRoute } from "@tanstack/react-router";
import { SupervisorReviewPage } from "./supervisor.evaluations.$evaluationId";

export const Route = createFileRoute("/_authenticated/supervisor/returned/$evaluationId")({
  component: SupervisorReviewPage,
});
