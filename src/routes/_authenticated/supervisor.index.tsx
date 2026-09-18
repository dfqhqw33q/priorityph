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
    const rows = [
      { status: "DRAFT", label: "Drafts", value: query.data?.statusBreakdown?.DRAFT ?? 0 },
      { status: "SUBMITTED", label: "To Review", value: query.data?.statusBreakdown?.SUBMITTED ?? 0 },
      { status: "FINALIZED", label: "Completed", value: query.data?.statusBreakdown?.FINALIZED ?? 0 },
    ];
    return rows;
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
              label="Total Evaluations Processed"
              value={query.data?.totalEvaluations ?? 0}
              to="/hr/evaluation-history"
              hint={cycleId ? "Current cycle" : "All cycles"}
            />
            <StatCard
              label="To Review"
              value={query.data?.pending ?? 0}
              to="/supervisor/evaluations"
              hint="Submitted"
            />
            <StatCard
              label="Completed"
              value={query.data?.completed ?? 0}
              to="/hr/completed"
              hint="Finalized"
            />
            <StatCard
              label="Drafts"
              value={query.data?.drafts ?? 0}
              to="/supervisor/evaluations"
              hint="In progress"
            />
          </div>

          <Card className="border border-border bg-card shadow-sm">
            <CardHeader>
              <CardTitle className="text-base">Evaluation Status</CardTitle>
            </CardHeader>
            <CardContent className="h-72">
              <ChartContainer
                config={{
                  value: { color: "hsl(var(--chart-1))", label: "Evaluations" },
                }}
                className="h-full w-full"
              >
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData} margin={{ top: 8, right: 8, left: -12, bottom: 8 }}>
                    <CartesianGrid vertical={false} strokeDasharray="3 3" />
                    <XAxis
                      dataKey="label"
                      tickLine={false}
                      axisLine={false}
                      interval={0}
                      angle={-20}
                      textAnchor="end"
                      height={52}
                    />
                    <YAxis allowDecimals={false} tickLine={false} axisLine={false} />
                    <Tooltip
                      cursor={{ fill: "hsl(var(--muted))" }}
                      content={
                        <ChartTooltipContent hideLabel formatter={(value) => [value, "Evaluations"]} />
                      }
                    />
                    <Bar dataKey="value" fill="hsl(var(--chart-1))" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </ChartContainer>
            </CardContent>
          </Card>

          <Card className="border border-border bg-card shadow-sm">
            <CardHeader>
              <CardTitle className="text-base">Recent Evaluation Activity</CardTitle>
            </CardHeader>
            <CardContent>
              {(query.data?.activity ?? []).length === 0 ? (
                <p className="text-sm text-muted-foreground">No recent evaluation activity.</p>
              ) : (
                <ul className="space-y-2 text-sm">
                  {(query.data?.activity ?? []).map((event) => (
                    <li key={event.id} className="flex flex-wrap items-center justify-between gap-2 border-b border-border pb-2 last:border-0 last:pb-0">
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
