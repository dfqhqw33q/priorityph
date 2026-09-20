import { createFileRoute, Outlet, useLocation } from "@tanstack/react-router";

import { HistoryTablePage } from "./hr.evaluation-history.index";

export const Route = createFileRoute("/_authenticated/committee/returned")({
  component: ReturnedPage,
});

function ReturnedPage() {
  const location = useLocation();
  const isDetailRoute =
    location.pathname !== "/committee/returned" &&
    location.pathname.startsWith("/committee/returned/");

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
