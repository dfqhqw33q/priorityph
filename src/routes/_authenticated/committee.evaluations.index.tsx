import { createFileRoute, Outlet, useLocation } from "@tanstack/react-router";

import { EvaluationStageQueuePage } from "@/features/performance-management/components/evaluation-stage-queue";

export const Route = createFileRoute("/_authenticated/committee/evaluations/")({
  head: () => ({
    meta: [
      { title: "Evaluations for Recommendation | Priority Handling Logistics, Inc." },
      {
        name: "description",
        content: "Record recommendations and final actions for evaluations.",
      },
      { property: "og:title", content: "Evaluations for Recommendation" },
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
