import { createFileRoute } from "@tanstack/react-router";

import { HistoryTablePage } from "./hr.evaluation-history.index";

export const Route = createFileRoute("/_authenticated/hr/completed")({
  component: CompletedPage,
});

function CompletedPage() {
  return (
    <HistoryTablePage
      title="Completed evaluations"
      description="View role-completed evaluation submissions for the selected cycle."
      defaultStatus="FOR_REVIEW"
      mode="completed"
      showStatusFilter={false}
    />
  );
}
