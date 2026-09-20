import { createFileRoute, Outlet, useLocation } from "@tanstack/react-router";

import { HistoryTablePage } from "./hr.evaluation-history.index";

export const Route = createFileRoute("/_authenticated/president/completed")({
  component: CompletedPage,
});

function CompletedPage() {
  const location = useLocation();
  const isDetailRoute =
    location.pathname !== "/president/completed" &&
    location.pathname.startsWith("/president/completed/");

  if (isDetailRoute) {
    return <Outlet />;
  }

  return (
    <HistoryTablePage
      title="Completed Evaluations"
      description="View finalized evaluation records."
      defaultStatus="FINALIZED"
      mode="completed"
      showStatusFilter={false}
    />
  );
}
