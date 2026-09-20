import { createFileRoute, Outlet, useLocation } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";

import { EvaluationQueue } from "@/features/performance-management/components/evaluation-queue";
import { PageHeader } from "@/components/shared/shared-ui";
import { listSupervisorQueue } from "@/lib/evaluations.functions";

export const Route = createFileRoute("/_authenticated/supervisor/evaluations/")({
  head: () => ({
    meta: [
      { title: "Employee Evaluations | Priority Handling Logistics, Inc." },
      {
        name: "description",
        content: "Review submitted evaluations and complete ratings.",
      },
      { property: "og:title", content: "Employee Evaluations" },
      {
        property: "og:description",
        content: "Search, filter, and review employee evaluations.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: SupervisorQueuePage,
});

function SupervisorQueuePage() {
  const location = useLocation();
  const isDetailRoute =
    location.pathname !== "/supervisor/evaluations" &&
    location.pathname.startsWith("/supervisor/evaluations/");

  if (isDetailRoute) {
    return <Outlet />;
  }

  const fetchQueue = useServerFn(listSupervisorQueue);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Employee Evaluations"
        description="Review submitted evaluations and complete ratings."
      />
      <EvaluationQueue
        queryKey="supervisor-queue"
        fetcher={fetchQueue}
        statuses={["SUBMITTED", "DRAFT", "RETURNED"]}
        detailPath="/supervisor/evaluations/$evaluationId"
        emptyTitle="No employee submissions to review"
      />
    </div>
  );
}
