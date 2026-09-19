import { createFileRoute, Outlet, useLocation } from "@tanstack/react-router";

import { HistoryTablePage } from "./hr.evaluation-history.index";

export const Route = createFileRoute("/_authenticated/reviewing-supervisor/completed")({
  component: CompletedPage,
});

function CompletedPage() {
  const location = useLocation();
  const isDetailRoute =
    location.pathname !== "/reviewing-supervisor/completed" &&
    location.pathname.startsWith("/reviewing-supervisor/completed/");

  if (isDetailRoute) {
    return <Outlet />;
  }

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
