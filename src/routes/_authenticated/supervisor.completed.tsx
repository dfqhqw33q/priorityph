import { createFileRoute, Outlet, useLocation } from "@tanstack/react-router";

import { HistoryTablePage } from "./hr.evaluation-history.index";

export const Route = createFileRoute("/_authenticated/supervisor/completed")({
  component: CompletedPage,
});

function CompletedPage() {
  const location = useLocation();
  const isDetailRoute =
    location.pathname !== "/supervisor/completed" &&
    location.pathname.startsWith("/supervisor/completed/");

  if (isDetailRoute) {
    return <Outlet />;
  }

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
