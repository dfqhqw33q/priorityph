import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";

import { EvaluationQueue } from "@/components/evaluation-queue";
import { PageHeader } from "@/components/ui-bits";
import { listPresidentQueue } from "@/lib/evaluations.functions";

export const Route = createFileRoute("/_authenticated/president/evaluations/")({
  head: () => ({
    meta: [
      { title: "President review queue | Priority Handling Logistics, Inc." },
      {
        name: "description",
        content: "Evaluations submitted by supervisors and awaiting Step 2 and Step 3 completion.",
      },
      { property: "og:title", content: "President review queue" },
      { property: "og:description", content: "Supervisor-submitted evaluations awaiting the President." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: PresidentQueuePage,
});

function PresidentQueuePage() {
  const fetchQueue = useServerFn(listPresidentQueue);

  return (
    <div className="space-y-6">
      <PageHeader
        title="President review queue"
        description="Only supervisor-submitted evaluations reach this stage."
      />
      <EvaluationQueue
        queryKey="president-queue"
        fetcher={fetchQueue}
        statuses={["SUPERVISOR_SUBMITTED", "PRESIDENT_REVIEW", "PRESIDENT_SUBMITTED", "FINALIZED"]}
        detailPath="/president/evaluations/$evaluationId"
        emptyTitle="No evaluations awaiting the President"
      />
    </div>
  );
}
