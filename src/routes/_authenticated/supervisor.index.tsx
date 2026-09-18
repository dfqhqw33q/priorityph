import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

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
  getSupervisorStats,
  listEvaluationCycleOptionsForUser,
} from "@/lib/evaluations.functions";
import { humanizeToken } from "@/lib/domain";

export const Route = createFileRoute("/_authenticated/supervisor/")({
  head: () => ({
    meta: [
      { title: "Supervisor dashboard | Priority Handling Logistics, Inc." },
      {
        name: "description",
        content: "Review employee self-assessments and track evaluation status by cycle.",
      },
      { property: "og:title", content: "Supervisor dashboard" },
      {
        property: "og:description",
        content: "Cycle-based supervisor evaluation dashboard.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: SupervisorDashboard,
});

function SupervisorDashboard() {
  const [cycleId, setCycleId] = useState<string | null>(null);
  const fetchStats = useServerFn(getSupervisorStats);
  const fetchCycleOptions = useServerFn(listEvaluationCycleOptionsForUser);

  const cycleOptionsQuery = useQuery({
    queryKey: ["cycle-options", "supervisor"],
    queryFn: () => fetchCycleOptions(),
    retry: false,
  });

  const query = useQuery({
    queryKey: ["supervisor-stats", cycleId],
    queryFn: () => fetchStats({ data: { cycleId } }),
    retry: false,
  });

  const chartData = useMemo(() => {
    const breakdown = query.data?.statusBreakdown ?? {};
    return [
      { status: "SUBMITTED", label: "To Review", value: breakdown.SUBMITTED ?? 0 },
      { status: "RETURNED", label: "Returned", value: breakdown.RETURNED ?? 0 },
      { status: "FINALIZED", label: "Completed", value: breakdown.SUBMITTED ?? 0 },
      { status: "DRAFT", label: "Drafts", value: breakdown.DRAFT ?? 0 },
    ];
  }, [query.data?.statusBreakdown]);

  if (query.isError) {
    const message = query.error instanceof Error ? query.error.message : "Unavailable";
    return <EmptyState title="You do not have access to supervisor review" description={message} />;
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Supervisor dashboard"
        description="Review and track your assigned employee evaluations."
        actions={
          <div className="flex items-center gap-2">
            <label htmlFor="supervisor-cycle" className="text-sm font-medium text-foreground">
              Evaluation Cycle
            </label>
            <select
              id="supervisor-cycle"
              className="h-9 rounded-md border border-input bg-background px-3 text-sm text-foreground shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
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
        }
      />

      {query.isLoading ? (
        <LoadingBlock rows={4} variant="cards" />
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard
              label="To Review"
              value={query.data?.toReview ?? query.data?.pending ?? 0}
              to="/supervisor/evaluations"
              hint="Submitted"
            />
            <StatCard
              label="Returned"
              value={query.data?.returned ?? 0}
              to="/hr/returned"
              hint="Needs correction"
            />
            <StatCard
              label="Completed"
              value={query.data?.completed ?? 0}
              to="/hr/completed"
              hint="Submitted records"
            />
            <StatCard
              label="Drafts"
              value={query.data?.drafts ?? 0}
              to="/hr/drafts"
              hint="In progress"
            />
          </div>

          <Card className="border border-border bg-card shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Evaluation Status</CardTitle>
            </CardHeader>
            <CardContent className="h-[260px] p-3 pt-0">
              <ChartContainer
                config={{
                  value: { color: "hsl(var(--chart-1))", label: "Evaluations" },
                }}
                className="h-full w-full"
              >
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={chartData}
                    layout="vertical"
                    margin={{ top: 6, right: 12, left: 8, bottom: 6 }}
                    barGap={8}
                  >
                    <CartesianGrid horizontal={false} strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis
                      type="number"
                      allowDecimals={false}
                      tickLine={false}
                      axisLine={false}
                      tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }}
                      domain={[0, (dataMax: number) => Math.max(dataMax, 1)]}
                    />
                    <YAxis
                      type="category"
                      dataKey="label"
                      tickLine={false}
                      axisLine={false}
                      width={84}
                      tick={{ fill: "hsl(var(--foreground))", fontSize: 12 }}
                    />
                    <Tooltip
                      cursor={{ fill: "hsl(var(--muted))" }}
                      content={
                        <ChartTooltipContent hideLabel formatter={(value) => [value, "Evaluations"]} />
                      }
                    />
                    <Bar
                      dataKey="value"
                      fill="hsl(var(--chart-1))"
                      radius={[0, 6, 6, 0]}
                      barSize={18}
                      label={{
                        position: "right",
                        formatter: (value: number | string) => `${value}`,
                        fill: "hsl(var(--foreground))",
                        fontSize: 12,
                        fontWeight: 600,
                      }}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </ChartContainer>
            </CardContent>
          </Card>

          <Card className="border border-border bg-card shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Recent Evaluation Activity</CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              {(query.data?.activity ?? []).length === 0 ? (
                <div className="flex min-h-[80px] items-center justify-center rounded-md border border-dashed border-border bg-muted/20 px-3 py-4 text-center">
                  <p className="text-sm text-muted-foreground">No recent evaluation activity.</p>
                </div>
              ) : (
                <ul className="space-y-2 text-sm">
                  {(query.data?.activity ?? []).map((event) => (
                    <li
                      key={event.id}
                      className="flex flex-wrap items-center justify-between gap-2 border-b border-border pb-2 last:border-0 last:pb-0"
                    >
                      <span className="font-medium text-foreground">{humanizeToken(event.action)}</span>
                      <span className="text-xs text-muted-foreground">{formatDateTime(event.occurred_at)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
