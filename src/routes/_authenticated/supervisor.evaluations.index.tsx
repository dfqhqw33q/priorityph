import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";

import { EvaluationQueue } from "@/features/performance-management/components/evaluation-queue";
import { PageHeader } from "@/components/shared/shared-ui";
import { listSupervisorQueue } from "@/lib/evaluations.functions";

export const Route = createFileRoute("/_authenticated/supervisor/evaluations/")({
  head: () => ({
    meta: [
      { title: "Supervisor review queue | Priority Handling Logistics, Inc." },
      {
        name: "description",
        content: "All employee Step 1 assessments available for supervisor rating and submission.",
      },
      { property: "og:title", content: "Supervisor review queue" },
      { property: "og:description", content: "Search, filter and open employee Step 1 assessments." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: SupervisorQueuePage,
});

function SupervisorQueuePage() {
  const fetchQueue = useServerFn(listSupervisorQueue);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Supervisor review queue"
        description="Review submitted self-assessments and complete your ratings."
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

