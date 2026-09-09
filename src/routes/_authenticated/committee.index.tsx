import { createFileRoute } from "@tanstack/react-router";
import { EvaluationStageQueuePage } from "@/features/performance-management/components/evaluation-stage-queue";
export const Route = createFileRoute("/_authenticated/committee/")({ component: () => <EvaluationStageQueuePage stage="COMMITTEE" /> });
