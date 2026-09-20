import { createFileRoute, Outlet, useLocation } from "@tanstack/react-router";

import { EvaluationStageQueuePage } from "@/features/performance-management/components/evaluation-stage-queue";

export const Route = createFileRoute("/_authenticated/president/evaluations/")({
  head: () => ({
    meta: [
      { title: "Pending Approvals | Priority Handling Logistics, Inc." },
      {
        name: "description",
        content: "Complete final approval for submitted evaluations.",
      },
      { property: "og:title", content: "Pending Approvals" },
      {
        property: "og:description",
        content: "Evaluations ready for final approval.",
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
