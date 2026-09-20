import { createFileRoute, Outlet, useLocation } from "@tanstack/react-router";

import { HistoryTablePage } from "./hr.evaluation-history.index";

export const Route = createFileRoute("/_authenticated/hr/completed")({
  component: CompletedPage,
});

function CompletedPage() {
  const location = useLocation();
  const isDetailRoute =
    location.pathname !== "/hr/completed" && location.pathname.startsWith("/hr/completed/");

  if (isDetailRoute) {
    return <Outlet />;
  }

  return (
    <HistoryTablePage
      title="Completed Evaluations"
      description="View finalized evaluation records."
      defaultStatus="FOR_REVIEW"
      mode="completed"
      showStatusFilter={false}
    />
  );
}
