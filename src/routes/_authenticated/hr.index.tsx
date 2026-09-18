import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  EmptyState,
  AuditActivityTable,
  DashboardSummaryLayout,
  LoadingBlock,
  PageHeader,
  StatCard,
} from "@/components/shared/shared-ui";
import { ChartContainer, ChartTooltipContent } from "@/components/ui/chart";
import { getHRStats, listEvaluationCycleOptionsForUser } from "@/lib/evaluations.functions";
import { type EvaluationStatus } from "@/lib/domain";

export const Route = createFileRoute("/_authenticated/hr/")({
  component: HrDashboard,
});

function HrDashboard() {
  const [cycleId, setCycleId] = useState<string | null>(null);
  const fetchStats = useServerFn(getHRStats);
  const fetchCycleOptions = useServerFn(listEvaluationCycleOptionsForUser);

  const cycleOptionsQuery = useQuery({
    queryKey: ["cycle-options", "hr"],
    queryFn: () => fetchCycleOptions(),
    retry: false,
  });

  const query = useQuery({
    queryKey: ["hr-stats", cycleId],
    queryFn: () => fetchStats({ data: { cycleId } }),
    retry: false,
  });

  const chartData = useMemo(() => {
    const breakdown = query.data?.statusBreakdown ?? ({} as Record<EvaluationStatus, number>);
    const count = (status: EvaluationStatus) => breakdown[status] ?? 0;
    return [
      { status: "FOR_PROCESSING", label: "To Review", value: count("FOR_PROCESSING"), color: "var(--info)" },
      { status: "RETURNED", label: "Returned", value: count("RETURNED"), color: "var(--warning)" },
      { status: "FOR_REVIEW", label: "Completed", value: count("FOR_REVIEW"), color: "var(--success)" },
      { status: "DRAFT", label: "Drafts", value: count("DRAFT"), color: "var(--muted-foreground)" },
    ];
  }, [query.data?.statusBreakdown]);

  if (query.isError) {
    const message = query.error instanceof Error ? query.error.message : "Unavailable";
    return <EmptyState title="You do not have HR access" description={message} />;
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="HR dashboard"
        description="Monitor organization-wide evaluation progress and cycle activity."
        actions={
          <div className="flex items-center gap-2">
            <label htmlFor="hr-cycle" className="text-sm font-medium text-foreground">
              Evaluation Cycle
            </label>
            <select
              id="hr-cycle"
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
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
            <StatCard
              label="Total Evaluations"
              value={query.data?.totalEvaluations ?? 0}
              to="/hr/evaluation-history"
              hint={cycleId ? "Current cycle" : "All cycles"}
            />
            <StatCard
              label="To Review"
              value={query.data?.awaitingReview ?? 0}
              to="/personnel"
              hint="Open tasks"
            />
            <StatCard
              label="Returned"
              value={query.data?.statusBreakdown.RETURNED ?? 0}
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

          <DashboardSummaryLayout
            status={
              <Card className="border border-border bg-card shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Evaluation Status</CardTitle>
            </CardHeader>
            <CardContent className="h-[260px] p-3 pt-0">
              <ChartContainer
                config={{ value: { color: "var(--info)", label: "Evaluations" } }}
                className="h-full w-full"
              >
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={chartData}
                    layout="vertical"
                    margin={{ top: 6, right: 12, left: 8, bottom: 6 }}
                    barGap={8}
                  >
                    <CartesianGrid horizontal={false} strokeDasharray="3 3" stroke="var(--border)" />
                    <XAxis
                      type="number"
                      allowDecimals={false}
                      tickLine={false}
                      axisLine={false}
                      tick={{ fill: "var(--muted-foreground)", fontSize: 12 }}
                      domain={[0, (dataMax: number) => Math.max(dataMax, 1)]}
                    />
                    <YAxis
                      type="category"
                      dataKey="label"
                      tickLine={false}
                      axisLine={false}
                      width={90}
                      tick={{ fill: "var(--foreground)", fontSize: 12 }}
                    />
                    <Tooltip
                      cursor={{ fill: "var(--muted)" }}
                      content={
                        <ChartTooltipContent hideLabel formatter={(value) => [value, "Evaluations"]} />
                      }
                    />
                    <Bar
                      dataKey="value"
                      radius={[0, 6, 6, 0]}
                      barSize={18}
                      label={{
                        position: "right",
                        formatter: (value: number | string) => `${value}`,
                        fill: "var(--foreground)",
                        fontSize: 12,
                        fontWeight: 600,
                      }}
                    >
                      {chartData.map((entry) => <Cell key={entry.status} fill={entry.color} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </ChartContainer>
            </CardContent>
              </Card>
            }
            activity={
              <Card className="border border-border bg-card shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Recent Evaluation Activity</CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <AuditActivityTable rows={query.data?.activity ?? []} />
            </CardContent>
              </Card>
            }
          />
        </>
      )}
    </div>
  );
}
