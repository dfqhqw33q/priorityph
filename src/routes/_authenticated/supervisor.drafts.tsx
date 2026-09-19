import { createFileRoute, Outlet, useLocation } from "@tanstack/react-router";

import { HistoryTablePage } from "./hr.evaluation-history.index";

export const Route = createFileRoute("/_authenticated/supervisor/drafts")({
  component: DraftsPage,
});

function DraftsPage() {
  const location = useLocation();
  const isDetailRoute =
    location.pathname !== "/supervisor/drafts" &&
    location.pathname.startsWith("/supervisor/drafts/");

  if (isDetailRoute) {
    return <Outlet />;
  }

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
