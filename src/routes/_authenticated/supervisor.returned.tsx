import { createFileRoute, Outlet, useLocation } from "@tanstack/react-router";

import { HistoryTablePage } from "./hr.evaluation-history.index";

export const Route = createFileRoute("/_authenticated/supervisor/returned")({
  component: ReturnedPage,
});

function ReturnedPage() {
  const location = useLocation();
  const isDetailRoute =
    location.pathname !== "/supervisor/returned" &&
    location.pathname.startsWith("/supervisor/returned/");

  if (isDetailRoute) {
    return <Outlet />;
  }

  return (
    <HistoryTablePage
      title="Returned Evaluations"
      description="Review evaluations returned for correction."
      defaultStatus="RETURNED"
      mode="returned"
      showStatusFilter={false}
    />
  );
}
