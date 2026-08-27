import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState, LoadingBlock, PageHeader, StatCard, formatDateTime } from "@/components/ui-bits";
import { getAdminStats } from "@/lib/admin.functions";
import { EVALUATION_STATUS_LABELS, ROLE_LABELS, type AppRole, type EvaluationStatus } from "@/lib/domain";
import { humanizeToken } from "@/lib/domain";

export const Route = createFileRoute("/_authenticated/admin/")({
  head: () => ({
    meta: [
      { title: "Administration overview | Priority Handling Logistics, Inc." },
      {
        name: "description",
        content: "System-wide overview of internal users, roles, cycles and evaluation progress.",
      },
      { property: "og:title", content: "Administration overview" },
      { property: "og:description", content: "Users, roles, cycles and audit activity at a glance." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AdminOverview,
});

function AdminOverview() {
  const fetchStats = useServerFn(getAdminStats);
  const query = useQuery({ queryKey: ["admin-stats"], queryFn: () => fetchStats(), retry: false });

  if (query.isError) {
    const message = query.error instanceof Error ? query.error.message : "Unavailable";
    return <EmptyState title="You do not have administrative access" description={message} />;
  }

  const stats = query.data;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Administration"
        description="Manage internal users, roles and permissions, employee records and the audit trail."
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
        <LoadingBlock rows={3} />
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard label="User accounts" value={stats?.totalUsers ?? 0} hint={`${stats?.activeUsers ?? 0} active`} />
            <StatCard label="Locked accounts" value={stats?.lockedUsers ?? 0} />
            <StatCard label="Active cycles" value={stats?.activeCycles ?? 0} />
            <StatCard label="Evaluations captured" value={stats?.totalEvaluations ?? 0} />
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Role distribution</CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2 text-sm">
                  {(Object.keys(ROLE_LABELS) as AppRole[]).map((role) => (
                    <li key={role} className="flex justify-between">
                      <span>{ROLE_LABELS[role]}</span>
                      <span className="font-semibold tabular-nums">
                        {stats?.roleCounts?.[role] ?? 0}
                      </span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Evaluations by stage</CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2 text-sm">
                  {(Object.keys(EVALUATION_STATUS_LABELS) as EvaluationStatus[]).map((status) => (
                    <li key={status} className="flex justify-between">
                      <span>{EVALUATION_STATUS_LABELS[status]}</span>
                      <span className="font-semibold tabular-nums">
                        {stats?.evaluationsByStatus?.[status] ?? 0}
                      </span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Recent administrative activity</CardTitle>
              </CardHeader>
              <CardContent>
                {(stats?.activity ?? []).length === 0 ? (
                  <p className="text-sm text-muted-foreground">Nothing recorded yet.</p>
                ) : (
                  <ul className="divide-y divide-border text-sm">
                    {(stats?.activity ?? []).map((event) => (
                      <li key={event.id} className="flex flex-wrap justify-between gap-2 py-2">
                        <span>{humanizeToken(event.action)}</span>
                        <span className="text-xs text-muted-foreground">
                          {formatDateTime(event.occurred_at)}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Recent sign-in events</CardTitle>
              </CardHeader>
              <CardContent>
                {(stats?.security ?? []).length === 0 ? (
                  <p className="text-sm text-muted-foreground">No sign-in events recorded.</p>
                ) : (
                  <ul className="divide-y divide-border text-sm">
                    {(stats?.security ?? []).map((event) => (
                      <li key={event.id} className="flex flex-wrap justify-between gap-2 py-2">
                        <span>
                          {event.email ?? "unknown"} · {humanizeToken(event.event_type)}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {event.result} · {formatDateTime(event.occurred_at)}
                        </span>
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
