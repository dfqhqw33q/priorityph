import { createFileRoute, Outlet, useLocation } from "@tanstack/react-router";

import { EvaluationStageQueuePage } from "@/features/performance-management/components/evaluation-stage-queue";

export const Route = createFileRoute("/_authenticated/reviewing-supervisor/evaluations/")({
  head: () => ({
    meta: [
      { title: "Reviewing Supervisor review queue | Priority Handling Logistics, Inc." },
      {
        name: "description",
        content: "Evaluations awaiting the reviewing supervisor's review and decision.",
      },
      { property: "og:title", content: "Reviewing Supervisor review queue" },
      {
        property: "og:description",
        content: "Assess employee evaluations before committee review.",
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
