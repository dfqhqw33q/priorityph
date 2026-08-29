import { createFileRoute } from "@tanstack/react-router";

import { Phase2QueuePage } from "@/components/phase2-queue";

export const Route = createFileRoute("/_authenticated/president/evaluations/")({
  head: () => ({
    meta: [
      { title: "President review queue | Priority Handling Logistics, Inc." },
      {
        name: "description",
        content: "Final approval queue for evaluations after the committee review stage.",
      },
      { property: "og:title", content: "President approval queue" },
      { property: "og:description", content: "Evaluations awaiting the President's final approval." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => <Phase2QueuePage stage="PRESIDENT" />,
});
