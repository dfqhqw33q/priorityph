import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  EmptyState,
  LoadingBlock,
  PageHeader,
  StatCard,
  formatDateTime,
} from "@/components/shared/shared-ui";
import { ChartContainer, ChartTooltipContent } from "@/components/ui/chart";
import {
  getReviewingSupervisorStats,
  listEvaluationCycleOptionsForUser,
} from "@/lib/evaluations.functions";
import { EVALUATION_STATUS_LABELS, humanizeToken } from "@/lib/domain";

export const Route = createFileRoute("/_authenticated/reviewing-supervisor/")({
  component: ReviewingSupervisorDashboard,
});

function ReviewingSupervisorDashboard() {
  const [cycleId, setCycleId] = useState<string | null>(null);
  const fetchStats = useServerFn(getReviewingSupervisorStats);
  const fetchCycleOptions = useServerFn(listEvaluationCycleOptionsForUser);

  const cycleOptionsQuery = useQuery({
    queryKey: ["cycle-options", "reviewing-supervisor"],
    queryFn: () => fetchCycleOptions(),
    retry: false,
  });

  const query = useQuery({
    queryKey: ["reviewing-supervisor-stats", cycleId],
    queryFn: () => fetchStats({ data: { cycleId } }),
    retry: false,
  });

  const chartData = useMemo(
    () =>
      Object.entries(query.data?.statusBreakdown ?? {}).map(([status, value]) => ({
        status,
        label: EVALUATION_STATUS_LABELS[status as keyof typeof EVALUATION_STATUS_LABELS] ?? humanizeToken(status),
        value,
      })),
    [query.data?.statusBreakdown],
  );

  if (query.isError) {
    const message = query.error instanceof Error ? query.error.message : "Unavailable";
    return <EmptyState title="You do not have access to reviewer review" description={message} />;
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Reviewing Supervisor dashboard"
        description="Review employee evaluations after supervisor ratings are submitted."
        actions={
          <Button asChild>
            <Link to="/reviewing-supervisor">Open review queue</Link>
          </Button>
        }
      />

      <Card className="border border-border bg-card shadow-sm">
        <CardContent className="pt-5">
          <div className="space-y-1.5 md:w-72">
            <label htmlFor="reviewing-supervisor-cycle" className="text-sm font-medium text-foreground">
              Evaluation cycle
            </label>
            <select
              id="reviewing-supervisor-cycle"
              className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              value={cycleId ?? "all"}
              onChange={(event) => setCycleId(event.target.value === "all" ? null : event.target.value)}
            >
              <option value="all">All cycles</option>
              {(cycleOptionsQuery.data ?? []).map((cycle) => (
                <option key={cycle.id} value={cycle.id}>
                  {cycle.name} ({cycle.year})
                </option>
              ))}
            </select>
          </div>
        </CardContent>
      </Card>

      {query.isLoading ? (
        <LoadingBlock rows={4} variant="cards" />
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard label="Awaiting review" value={query.data?.awaiting ?? 0} to="/reviewing-supervisor" hint="Ready for input" />
            <StatCard label="Returned for correction" value={query.data?.returned ?? 0} to="/reviewing-supervisor" hint="Needs action" />
            <StatCard label="In active review" value={query.data?.inProgress ?? 0} to="/reviewing-supervisor" hint="Currently in process" />
            <StatCard label="Finalized" value={query.data?.finalized ?? 0} to="/hr/completed" hint="Completed" />
          </div>

          <div className="grid gap-4 xl:grid-cols-[1.6fr_0.9fr]">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Status distribution</CardTitle>
              </CardHeader>
              <CardContent className="h-72">
                <ChartContainer config={{ value: { color: "hsl(var(--chart-2))", label: "Evaluations" } }} className="h-full w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={chartData} margin={{ top: 8, right: 8, left: -12, bottom: 8 }}>
                      <CartesianGrid vertical={false} strokeDasharray="3 3" />
                      <XAxis dataKey="label" tickLine={false} axisLine={false} interval={0} angle={-20} textAnchor="end" height={52} />
                      <YAxis allowDecimals={false} tickLine={false} axisLine={false} />
                      <Tooltip cursor={{ fill: "hsl(var(--muted))" }} content={<ChartTooltipContent hideLabel formatter={(value) => [value, "Evaluations"]} />} />
                      <Bar dataKey="value" fill="hsl(var(--chart-2))" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </ChartContainer>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Recent review activity</CardTitle>
              </CardHeader>
              <CardContent>
                {(query.data?.activity ?? []).length === 0 ? (
                  <p className="text-sm text-muted-foreground">No review activity recorded yet.</p>
                ) : (
                  <ul className="divide-y divide-border text-sm">
                    {(query.data?.activity ?? []).map((event) => (
                      <li key={event.id} className="flex flex-wrap justify-between gap-2 py-2">
                        <span className="font-medium text-foreground">{humanizeToken(event.action)}</span>
                        <span className="text-xs text-muted-foreground">{formatDateTime(event.occurred_at)}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
