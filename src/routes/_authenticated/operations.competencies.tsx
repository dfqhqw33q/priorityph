import { createFileRoute } from "@tanstack/react-router";

import { CompetencyWorkspace } from "@/features/competency-management/components/competency-workspace";

export const Route = createFileRoute("/_authenticated/operations/competencies")({
  component: CompetencyWorkspace,
});
