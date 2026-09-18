import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo } from "react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  EmptyState,
  DashboardSummaryLayout,
  LoadingBlock,
  PageHeader,
  StatCard,
  formatDateTime,
} from "@/components/shared/shared-ui";
import { ChartContainer, ChartTooltipContent } from "@/components/ui/chart";
import { getAdminStats } from "@/lib/admin.functions";
import { EVALUATION_STATUS_LABELS, humanizeToken } from "@/lib/domain";

export const Route = createFileRoute("/_authenticated/admin/")({
  head: () => ({
    meta: [
      { title: "Administration overview | Priority Handling Logistics, Inc." },
      {
        name: "description",
        content: "System-wide overview of internal users, roles, cycles and evaluation progress.",
      },
      { property: "og:title", content: "Administration overview" },
      {
        property: "og:description",
        content: "Users, roles, cycles and audit activity at a glance.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AdminOverview,
});

function AdminOverview() {
  const fetchStats = useServerFn(getAdminStats);
  const query = useQuery({ queryKey: ["admin-stats"], queryFn: () => fetchStats(), retry: false });

  const chartData = useMemo(() => {
    return (Object.keys(EVALUATION_STATUS_LABELS) as Array<keyof typeof EVALUATION_STATUS_LABELS>).map(
      (status) => ({
        status,
        label: EVALUATION_STATUS_LABELS[status],
        value: query.data?.evaluationsByStatus?.[status] ?? 0,
      }),
    );
  }, [query.data?.evaluationsByStatus]);

  if (query.isError) {
    const message = query.error instanceof Error ? query.error.message : "Unavailable";
    return <EmptyState title="You do not have administrative access" description={message} />;
  }

  const stats = query.data;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Administration"
        description="Oversee users, access, employee records, and system activity."
      />

      {query.isLoading ? (
        <LoadingBlock rows={4} variant="cards" />
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard label="Total Users" value={stats?.totalUsers ?? 0} hint="Accounts" />
            <StatCard label="Active Users" value={stats?.activeUsers ?? 0} hint="Active" />
            <StatCard label="Audit Events" value={stats?.auditEvents ?? 0} to="/admin/audit-logs" hint="System log" />
            <StatCard label="Employee Records" value={stats?.employeeRecords ?? 0} to="/admin/employees" hint="Profiles" />
          </div>

          <DashboardSummaryLayout
            status={
              <Card className="border border-border bg-card shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Evaluation Status</CardTitle>
            </CardHeader>
            <CardContent className="h-[260px] p-3 pt-0">
              <ChartContainer
                config={{ value: { color: "var(--warning)", label: "Evaluations" } }}
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
                      width={100}
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
                      fill="var(--warning)"
                      radius={[0, 6, 6, 0]}
                      barSize={18}
                      label={{
                        position: "right",
                        formatter: (value: number | string) => `${value}`,
                        fill: "var(--foreground)",
                        fontSize: 12,
                        fontWeight: 600,
                      }}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </ChartContainer>
            </CardContent>
              </Card>
            }
            activity={
              <Card className="border border-border bg-card shadow-sm">

          <Card className="border border-border bg-card shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Recent Evaluation Activity</CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              {(stats?.activity ?? []).length === 0 ? (
                <div className="flex min-h-[80px] items-center justify-center rounded-md border border-dashed border-border bg-muted/20 px-3 py-4 text-center">
                  <p className="text-sm text-muted-foreground">No recent evaluation activity.</p>
                </div>
              ) : (
                <ul className="space-y-2 text-sm">
                  {(stats?.activity ?? []).map((event) => (
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
            }
          />
        </>
      )}
    </div>
  );
}
