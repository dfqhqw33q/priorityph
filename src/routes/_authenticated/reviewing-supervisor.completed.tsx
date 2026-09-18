import { createFileRoute } from "@tanstack/react-router";

import { HistoryTablePage } from "./hr.evaluation-history.index";

export const Route = createFileRoute("/_authenticated/reviewing-supervisor/completed")({
  component: CompletedPage,
});

function CompletedPage() {
  return (
    <HistoryTablePage
      title="Completed evaluations"
      description="View the evaluations you have completed in this cycle."
      defaultStatus="FOR_PROCESSING"
      mode="completed"
      showStatusFilter={false}
    />
  );
}
