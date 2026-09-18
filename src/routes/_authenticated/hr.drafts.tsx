import { createFileRoute } from "@tanstack/react-router";

import { HistoryTablePage } from "./hr.evaluation-history.index";

export const Route = createFileRoute("/_authenticated/hr/drafts")({
  component: DraftsPage,
});

function DraftsPage() {
  return (
    <HistoryTablePage
      title="Draft evaluations"
      description="Review in-progress evaluations that have not yet been submitted for review."
      defaultStatus="DRAFT"
      mode="drafts"
      showStatusFilter={false}
    />
  );
}
