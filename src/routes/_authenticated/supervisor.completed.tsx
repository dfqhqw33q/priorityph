import { createFileRoute } from "@tanstack/react-router";

import { HistoryTablePage } from "./hr.evaluation-history.index";

export const Route = createFileRoute("/_authenticated/supervisor/completed")({
  component: CompletedPage,
});

function CompletedPage() {
  return (
    <HistoryTablePage
      title="Completed evaluations"
      description="View the evaluations you have completed in this cycle."
      defaultStatus="FOR_REVIEW"
      mode="completed"
      showStatusFilter={false}
    />
  );
}
