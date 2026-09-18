import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo } from "react";
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
        actions={
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="outline">
              <Link to="/admin/users">Users</Link>
            </Button>
            <Button asChild variant="outline">
              <Link to="/admin/roles">Roles</Link>
            </Button>
            <Button asChild>
              <Link to="/admin/audit-logs">Audit logs</Link>
            </Button>
          </div>
        }
      />

      {query.isLoading ? (
        <LoadingBlock rows={4} variant="cards" />
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard label="User Accounts" value={stats?.totalUsers ?? 0} hint={`${stats?.activeUsers ?? 0} active`} />
            <StatCard label="Locked Accounts" value={stats?.lockedUsers ?? 0} hint="Security review" />
            <StatCard label="Active Cycles" value={stats?.activeCycles ?? 0} hint="Open workflows" />
            <StatCard label="Evaluations Captured" value={stats?.totalEvaluations ?? 0} to="/hr/evaluation-history" hint="All records" />
          </div>

          <Card className="border border-border bg-card shadow-sm">
            <CardHeader>
              <CardTitle className="text-base">Evaluation Status</CardTitle>
            </CardHeader>
            <CardContent className="h-72">
              <ChartContainer
                config={{ value: { color: "hsl(var(--chart-5))", label: "Evaluations" } }}
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
                    <Bar dataKey="value" fill="hsl(var(--chart-5))" radius={[4, 4, 0, 0]} />
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
              {(stats?.activity ?? []).length === 0 ? (
                <p className="text-sm text-muted-foreground">No recent evaluation activity.</p>
              ) : (
                <ul className="space-y-2 text-sm">
                  {(stats?.activity ?? []).map((event) => (
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
