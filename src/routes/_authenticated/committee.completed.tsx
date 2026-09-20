import { createFileRoute, Outlet, useLocation } from "@tanstack/react-router";

import { HistoryTablePage } from "./hr.evaluation-history.index";

export const Route = createFileRoute("/_authenticated/committee/completed")({
  component: CompletedPage,
});

function CompletedPage() {
  const location = useLocation();
  const isDetailRoute =
    location.pathname !== "/committee/completed" &&
    location.pathname.startsWith("/committee/completed/");

  if (isDetailRoute) {
    return <Outlet />;
  }

  return (
    <HistoryTablePage
      title="Completed Evaluations"
      description="View finalized evaluation records."
      defaultStatus="FOR_APPROVAL"
      mode="completed"
      showStatusFilter={false}
    />
  );
}
