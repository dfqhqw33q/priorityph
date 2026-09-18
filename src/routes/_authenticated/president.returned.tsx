import { createFileRoute } from "@tanstack/react-router";

import { HistoryTablePage } from "./hr.evaluation-history.index";

export const Route = createFileRoute("/_authenticated/president/returned")({
  component: ReturnedPage,
});

function ReturnedPage() {
  return (
    <HistoryTablePage
      title="Returned evaluations"
      description="Review evaluations that were returned for correction and resubmission."
      defaultStatus="RETURNED"
      mode="returned"
      showStatusFilter={false}
    />
  );
}
