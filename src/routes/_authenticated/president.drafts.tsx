import { createFileRoute, Outlet, useLocation } from "@tanstack/react-router";

import { HistoryTablePage } from "./hr.evaluation-history.index";

export const Route = createFileRoute("/_authenticated/president/drafts")({
  component: DraftsPage,
});

function DraftsPage() {
  const location = useLocation();
  const isDetailRoute =
    location.pathname !== "/president/drafts" &&
    location.pathname.startsWith("/president/drafts/");

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
