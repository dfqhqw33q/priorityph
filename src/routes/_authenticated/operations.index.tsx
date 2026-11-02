import { createFileRoute } from "@tanstack/react-router";

import { OperationsDashboard } from "@/features/operations-management/components/operations-workspace";

export const Route = createFileRoute("/_authenticated/operations/")({
  component: OperationsDashboard,
});
