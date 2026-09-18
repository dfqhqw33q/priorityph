import { createFileRoute } from "@tanstack/react-router";

import { HistoryTablePage } from "./hr.evaluation-history.index";

export const Route = createFileRoute("/_authenticated/hr/completed")({
  component: CompletedPage,
});

function CompletedPage() {
  return (
    <HistoryTablePage
      title="Completed evaluations"
      description="View submitted evaluation records for the selected cycle."
      defaultStatus="SUBMITTED"
      mode="completed"
      showStatusFilter={false}
    />
  );
}
