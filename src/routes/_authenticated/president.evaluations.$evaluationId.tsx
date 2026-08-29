import { createFileRoute } from "@tanstack/react-router";

import { Phase2StageDetail } from "@/components/phase2-stage-detail";

export const Route = createFileRoute("/_authenticated/president/evaluations/$evaluationId")({
  head: () => ({
    meta: [
      { title: "President approval | Priority Handling Logistics, Inc." },
      {
        name: "description",
        content: "Review the complete accumulated evaluation and make the final approval decision.",
      },
      { property: "og:title", content: "President final approval" },
      { property: "og:description", content: "Final approval for the canonical evaluation workflow." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => <Phase2StageDetail stage="PRESIDENT" evaluationId={Route.useParams().evaluationId} />,
});
