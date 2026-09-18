import { createFileRoute } from "@tanstack/react-router";

import { HistoryTablePage } from "./hr.evaluation-history.index";

export const Route = createFileRoute("/_authenticated/president/completed")({
  component: CompletedPage,
});

function CompletedPage() {
  return (
    <HistoryTablePage
      title="Completed evaluations"
      description="View finalized and completed evaluation records."
      defaultStatus="FINALIZED"
      mode="completed"
      showStatusFilter={false}
    />
  );
}
