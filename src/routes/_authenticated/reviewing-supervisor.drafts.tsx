import { createFileRoute, Outlet, useLocation } from "@tanstack/react-router";

import { HistoryTablePage } from "./hr.evaluation-history.index";

export const Route = createFileRoute("/_authenticated/reviewing-supervisor/drafts")({
  component: DraftsPage,
});

function DraftsPage() {
  const location = useLocation();
  const isDetailRoute =
    location.pathname !== "/reviewing-supervisor/drafts" &&
    location.pathname.startsWith("/reviewing-supervisor/drafts/");

  if (isDetailRoute) {
    return <Outlet />;
  }

  return (
    <HistoryTablePage
      title="Draft Evaluations"
      description="Continue evaluations saved as drafts."
      defaultStatus="DRAFT"
      mode="drafts"
      showStatusFilter={false}
    />
  );
}
