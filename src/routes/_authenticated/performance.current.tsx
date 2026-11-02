import { createFileRoute } from "@tanstack/react-router";

import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";

import {
  EmptyState,
  ErrorState,
  LoadingState,
  PageHeader,
  StatusBadge,
} from "@/components/shared/portal-ui";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getMyEvaluationFramework } from "@/lib/evaluation.functions";

export const Route = createFileRoute("/_authenticated/performance/current")({
  component: CurrentEvaluationPage,
});

function CurrentEvaluationPage() {
  const loadFramework = useServerFn(getMyEvaluationFramework);
  const query = useQuery({
    queryKey: ["my-evaluation-framework"],
    queryFn: () => loadFramework(),
  });
  if (query.isPending) return <LoadingState label="Loading your current evaluation" />;
  if (query.isError) return <ErrorState message={query.error.message} />;
  const { evaluation, period, position } = query.data;
  return (
    <div className="space-y-6">
      <PageHeader
        breadcrumbs={["My Performance", "Current Evaluation"]}
        title="Current Evaluation"
        description="Check the evaluation period currently assigned to you."
      />
      {evaluation && period ? (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between gap-3">
              <span>{period.name}</span>
              <StatusBadge>{evaluation.status.replaceAll("_", " ")}</StatusBadge>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              {position} · {period.startsOn} – {period.endsOn}
              {period.submissionDeadline ? ` · Due ${period.submissionDeadline}` : ""}
            </p>
            <Button asChild>
              <a href="/performance/self-evaluation">
                {[
                  "DRAFT",
                  "IN_PROGRESS",
                  "RETURNED_FOR_REVISION",
                  "RETURNED_BY_HR",
                  "REOPENED",
                ].includes(evaluation.status)
                  ? "Continue self-evaluation"
                  : "View self-evaluation"}
              </a>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <EmptyState
          title="No current evaluation assigned"
          description="There is no active performance evaluation assigned to your employee profile."
          detail="When a cycle is launched for you, its status and due date will appear here."
        />
      )}
    </div>
  );
}
