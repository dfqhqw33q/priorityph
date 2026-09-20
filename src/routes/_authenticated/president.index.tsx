import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

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
import { getPresidentStats } from "@/lib/president.functions";
import { listEvaluationCycleOptionsForUser } from "@/lib/evaluations.functions";

export const Route = createFileRoute("/_authenticated/president/")({
  head: () => ({
    meta: [
      { title: "Dashboard | Priority Handling Logistics, Inc." },
      {
        name: "description",
        content: "Track completion and approval status across evaluation cycles.",
      },
      { property: "og:title", content: "Dashboard" },
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
  const [cycleId, setCycleId] = useState<string | null | undefined>(undefined);
  const fetchStats = useServerFn(getPresidentStats);
  const fetchCycleOptions = useServerFn(listEvaluationCycleOptionsForUser);

  const cycleOptionsQuery = useQuery({
    queryKey: ["cycle-options", "president"],
    queryFn: () => fetchCycleOptions(),
    retry: false,
  });
  useEffect(() => {
    if (cycleId !== undefined || !cycleOptionsQuery.isSuccess) return;
    setCycleId(cycleOptionsQuery.data.find((cycle) => cycle.status === "ACTIVE")?.id ?? null);
  }, [cycleId, cycleOptionsQuery.data, cycleOptionsQuery.isSuccess]);

  const query = useQuery({
    queryKey: ["president-stats", cycleId ?? "initializing"],
    queryFn: () => fetchStats({ data: { cycleId: cycleId ?? null } }),
    enabled: cycleId !== undefined,
    retry: false,
  });

  const chartData = useMemo(() => {
    const breakdown = (query.data?.statusBreakdown ?? {}) as Record<string, number>;
    return [
      {
        status: "FOR_APPROVAL",
        label: "To Review",
        value: breakdown["FOR_APPROVAL"] ?? 0,
        color: "var(--info)",
      },
      {
        status: "RETURNED",
        label: "Returned",
        value: breakdown["RETURNED"] ?? 0,
        color: "var(--warning)",
      },
      {
        status: "FINALIZED",
        label: "Completed",
        value: breakdown["FINALIZED"] ?? 0,
        color: "var(--success)",
      },
      {
        status: "DRAFT",
        label: "Drafts",
        value: breakdown["DRAFT"] ?? 0,
        color: "var(--muted-foreground)",
      },
    ];
  }, [query.data?.statusBreakdown]);

  if (query.isError) {
    const message = query.error instanceof Error ? query.error.message : "Unavailable";
    return <EmptyState title="You do not have access to President review" description={message} />;
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Dashboard"
        description="Review evaluations and complete final approvals."
        actions={
          <div className="flex items-center gap-2">
            <label htmlFor="president-cycle" className="text-sm font-medium text-foreground">
              Evaluation Cycle
            </label>
            <select
              id="president-cycle"
              className="h-9 rounded-md border border-input bg-background px-3 text-sm text-foreground shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              value={cycleId ?? "all"}
              onChange={(event) =>
                setCycleId(event.target.value === "all" ? null : event.target.value)
              }
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
              value={query.data?.toReview ?? query.data?.pendingApprovals ?? 0}
              to="/president/evaluations"
              hint="Pending approval"
            />
            <StatCard
              label="Returned"
              value={query.data?.returned ?? 0}
              to="/president/returned"
              hint="Needs correction"
            />
            <StatCard
              label="Completed"
              value={query.data?.completed ?? 0}
              to="/president/completed"
              hint="Submitted records"
            />
            <StatCard
              label="Drafts"
              value={query.data?.drafts ?? 0}
              to="/president/drafts"
              hint="In progress"
            />
          </div>

          <DashboardSummaryLayout
            status={
              <Card className="border border-border bg-card shadow-sm">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">Evaluation Status</CardTitle>
                </CardHeader>
                <CardContent className="h-[220px] p-3 pt-0">
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
                        <CartesianGrid
                          horizontal={false}
                          strokeDasharray="3 3"
                          stroke="var(--border)"
                        />
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
                          width={100}
                          tick={{ fill: "var(--foreground)", fontSize: 12 }}
                        />
                        <Tooltip
                          cursor={{ fill: "var(--muted)" }}
                          content={
                            <ChartTooltipContent
                              hideLabel
                              formatter={(value) => [value, "Evaluations"]}
                            />
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
                          {chartData.map((entry) => (
                            <Cell key={entry.status} fill={entry.color} />
                          ))}
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
