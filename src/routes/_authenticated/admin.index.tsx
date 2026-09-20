import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";

import { EmptyState, LoadingBlock, PageHeader, StatCard } from "@/components/shared/shared-ui";
import { getAdminStats } from "@/lib/admin.functions";

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
            <StatCard
              label="Total Users"
              value={stats?.totalUsers ?? 0}
              to="/admin/users"
              hint="Accounts"
            />
            <StatCard
              label="Active Users"
              value={stats?.activeUsers ?? 0}
              to="/admin/users"
              hint="Active"
            />
            <StatCard
              label="Audit Events"
              value={stats?.auditEvents ?? 0}
              to="/admin/audit-logs"
              hint="System log"
            />
            <StatCard
              label="Employee Records"
              value={stats?.employeeRecords ?? 0}
              to="/admin/employee-profiles"
              hint="Profiles"
            />
          </div>
        </>
      )}
    </div>
  );
}
