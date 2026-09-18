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
import { getPresidentStats } from "@/lib/president.functions";
import { humanizeToken } from "@/lib/domain";
import { listEvaluationCycleOptionsForUser } from "@/lib/evaluations.functions";

export const Route = createFileRoute("/_authenticated/president/")({
  head: () => ({
    meta: [
      { title: "President dashboard | Priority Handling Logistics, Inc." },
      {
        name: "description",
        content: "Track completion and approval status across evaluation cycles.",
      },
      { property: "og:title", content: "President dashboard" },
      {
        property: "og:description",
        content: "Evaluations awaiting presidential review and sign-off.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: PresidentDashboard,
});

function PresidentDashboard() {
  const [cycleId, setCycleId] = useState<string | null>(null);
  const fetchStats = useServerFn(getPresidentStats);
  const fetchCycleOptions = useServerFn(listEvaluationCycleOptionsForUser);

  const cycleOptionsQuery = useQuery({
    queryKey: ["cycle-options", "president"],
    queryFn: () => fetchCycleOptions(),
    retry: false,
  });

  const query = useQuery({
    queryKey: ["president-stats", cycleId],
    queryFn: () => fetchStats({ data: { cycleId } }),
    retry: false,
  });

  const chartData = useMemo(() => {
    const breakdown = query.data?.statusBreakdown ?? {};
    const rows = [
      { status: "FOR_APPROVAL", label: "Pending Approvals", value: breakdown.FOR_APPROVAL ?? 0 },
      { status: "RETURNED", label: "Returned", value: breakdown.RETURNED ?? 0 },
      { status: "FINALIZED", label: "Completed", value: breakdown.FINALIZED ?? 0 },
    ];
    return rows.filter(
      (row) => row.value > 0 || ["FOR_APPROVAL", "RETURNED", "FINALIZED"].includes(row.status),
    );
  }, [query.data?.statusBreakdown]);

  if (query.isError) {
    const message = query.error instanceof Error ? query.error.message : "Unavailable";
    return <EmptyState title="You do not have access to President review" description={message} />;
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="President dashboard"
        description="Review completed evaluations and make the final approval decision."
        actions={
          <div className="flex items-center gap-2">
            <label htmlFor="president-cycle" className="text-sm font-medium text-foreground">
              Evaluation Cycle
            </label>
            <select
              id="president-cycle"
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
              label="Pending Approvals"
              value={query.data?.pendingApprovals ?? 0}
              to="/president/evaluations"
              hint="Ready for review"
            />
            <StatCard
              label="Returned"
              value={query.data?.returned ?? 0}
              to="/president/evaluations"
              hint="Needs correction"
            />
            <StatCard
              label="Completed"
              value={query.data?.completed ?? 0}
              to="/hr/completed"
              hint="Finalized"
            />
            <StatCard
              label="Total Finalized"
              value={query.data?.totalFinalized ?? query.data?.finalized ?? 0}
              to="/hr/evaluation-history"
              hint={cycleId ? "Current cycle" : "All cycles"}
            />
          </div>

          <Card className="border border-border bg-card shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Evaluation Status</CardTitle>
            </CardHeader>
            <CardContent className="h-[260px] p-3 pt-0">
              <ChartContainer
                config={{ value: { color: "hsl(var(--chart-4))", label: "Evaluations" } }}
                className="h-full w-full"
              >
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={chartData}
                    layout="vertical"
                    margin={{ top: 4, right: 12, left: 8, bottom: 4 }}
                  >
                    <CartesianGrid horizontal={false} strokeDasharray="3 3" />
                    <XAxis type="number" allowDecimals={false} tickLine={false} axisLine={false} />
                    <YAxis type="category" dataKey="label" tickLine={false} axisLine={false} width={100} />
                    <Tooltip
                      cursor={{ fill: "hsl(var(--muted))" }}
                      content={
                        <ChartTooltipContent hideLabel formatter={(value) => [value, "Evaluations"]} />
                      }
                    />
                    <Bar dataKey="value" fill="hsl(var(--chart-4))" radius={[0, 4, 4, 0]} />
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
