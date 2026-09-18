import { createFileRoute } from "@tanstack/react-router";

import { HistoryTablePage } from "./hr.evaluation-history.index";

export const Route = createFileRoute("/_authenticated/hr/completed")({
  component: CompletedPage,
});

function CompletedPage() {
  return (
    <HistoryTablePage
      title="Completed evaluations"
      description="Review finalized evaluation records by cycle and employee."
      defaultStatus="FINALIZED"
    />
  );
}
