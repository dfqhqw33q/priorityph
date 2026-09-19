import { createFileRoute, Outlet, useLocation } from "@tanstack/react-router";

import { EvaluationStageQueuePage } from "@/features/performance-management/components/evaluation-stage-queue";

export const Route = createFileRoute("/_authenticated/president/evaluations/")({
  head: () => ({
    meta: [
      { title: "President review queue | Priority Handling Logistics, Inc." },
      {
        name: "description",
        content: "Final approval queue for evaluations after the committee review stage.",
      },
      { property: "og:title", content: "President approval queue" },
      {
        property: "og:description",
        content: "Evaluations awaiting the President's final approval.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: function PresidentQueueRoute() {
    const location = useLocation();
    const isDetailRoute =
      location.pathname !== "/president/evaluations" &&
      location.pathname.startsWith("/president/evaluations/");

    if (isDetailRoute) {
      return <Outlet />;
    }

    return <EvaluationStageQueuePage stage="PRESIDENT" />;
  },
});
