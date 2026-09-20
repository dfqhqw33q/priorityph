import { createFileRoute, Outlet, useLocation } from "@tanstack/react-router";

import { EvaluationStageQueuePage } from "@/features/performance-management/components/evaluation-stage-queue";

export const Route = createFileRoute("/_authenticated/reviewing-supervisor/evaluations/")({
  head: () => ({
    meta: [
      { title: "Evaluations for Review | Priority Handling Logistics, Inc." },
      {
        name: "description",
        content: "Review evaluations submitted for the next stage.",
      },
      { property: "og:title", content: "Evaluations for Review" },
      {
        property: "og:description",
        content: "Review evaluations before the next workflow stage.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: function ReviewingSupervisorQueueRoute() {
    const location = useLocation();
    const isDetailRoute =
      location.pathname !== "/reviewing-supervisor/evaluations" &&
      location.pathname.startsWith("/reviewing-supervisor/evaluations/");

    if (isDetailRoute) {
      return <Outlet />;
    }

    return <EvaluationStageQueuePage stage="REVIEWING_SUPERVISOR" />;
  },
});
