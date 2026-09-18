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
  getCommitteeStats,
  listEvaluationCycleOptionsForUser,
} from "@/lib/evaluations.functions";
import { EVALUATION_STATUS_LABELS, humanizeToken } from "@/lib/domain";

export const Route = createFileRoute("/_authenticated/committee/")({
  component: CommitteeDashboard,
});

function CommitteeDashboard() {
  const [cycleId, setCycleId] = useState<string | null>(null);
  const fetchStats = useServerFn(getCommitteeStats);
  const fetchCycleOptions = useServerFn(listEvaluationCycleOptionsForUser);

  const cycleOptionsQuery = useQuery({
    queryKey: ["cycle-options", "committee"],
    queryFn: () => fetchCycleOptions(),
    retry: false,
  });

  const query = useQuery({
    queryKey: ["committee-stats", cycleId],
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
    return <EmptyState title="You do not have access to committee review" description={message} />;
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Committee dashboard"
        description="Review evaluations and decide the final recommendation for each employee."
        actions={
          <Button asChild>
            <Link to="/committee">Open committee queue</Link>
          </Button>
        }
      />

      <Card className="border border-border bg-card shadow-sm">
        <CardContent className="pt-5">
          <div className="space-y-1.5 md:w-72">
            <label htmlFor="committee-cycle" className="text-sm font-medium text-foreground">
              Evaluation cycle
            </label>
            <select
              id="committee-cycle"
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
            <StatCard label="Awaiting committee review" value={query.data?.awaiting ?? 0} to="/committee" hint="Ready for recommendation" />
            <StatCard label="Returned for correction" value={query.data?.returned ?? 0} to="/committee" hint="Needs revision" />
            <StatCard label="In active recommendation" value={query.data?.inProgress ?? 0} to="/committee" hint="Current cycle" />
            <StatCard label="Finalized" value={query.data?.finalized ?? 0} to="/hr/completed" hint="Completed" />
          </div>

          <div className="grid gap-4 xl:grid-cols-[1.6fr_0.9fr]">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Recommendation status</CardTitle>
              </CardHeader>
              <CardContent className="h-72">
                <ChartContainer config={{ value: { color: "hsl(var(--chart-3))", label: "Evaluations" } }} className="h-full w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={chartData} margin={{ top: 8, right: 8, left: -12, bottom: 8 }}>
                      <CartesianGrid vertical={false} strokeDasharray="3 3" />
                      <XAxis dataKey="label" tickLine={false} axisLine={false} interval={0} angle={-20} textAnchor="end" height={52} />
                      <YAxis allowDecimals={false} tickLine={false} axisLine={false} />
                      <Tooltip cursor={{ fill: "hsl(var(--muted))" }} content={<ChartTooltipContent hideLabel formatter={(value) => [value, "Evaluations"]} />} />
                      <Bar dataKey="value" fill="hsl(var(--chart-3))" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </ChartContainer>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Recent committee activity</CardTitle>
              </CardHeader>
              <CardContent>
                {(query.data?.activity ?? []).length === 0 ? (
                  <p className="text-sm text-muted-foreground">No committee activity recorded yet.</p>
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
