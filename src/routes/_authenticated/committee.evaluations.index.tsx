import { createFileRoute, Outlet, useLocation } from "@tanstack/react-router";

import { EvaluationStageQueuePage } from "@/features/performance-management/components/evaluation-stage-queue";

export const Route = createFileRoute("/_authenticated/committee/evaluations/")({
  head: () => ({
    meta: [
      { title: "Committee review queue | Priority Handling Logistics, Inc." },
      {
        name: "description",
        content: "Evaluations awaiting committee recommendation and final action.",
      },
      { property: "og:title", content: "Committee review queue" },
      {
        property: "og:description",
        content: "Review evaluations and decide the recommended action.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: function CommitteeQueueRoute() {
    const location = useLocation();
    const isDetailRoute =
      location.pathname !== "/committee/evaluations" &&
      location.pathname.startsWith("/committee/evaluations/");

    if (isDetailRoute) {
      return <Outlet />;
    }

    return <EvaluationStageQueuePage stage="COMMITTEE" />;
  },
});
