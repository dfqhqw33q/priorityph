import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";

import { Button } from "@/components/ui/button";
import {
  EmptyState,
  ErrorState,
  LoadingState,
  PageHeader,
  SummaryCard,
} from "@/components/shared/portal-ui";
import { getSupervisorDashboard, getSupervisorTeam } from "@/lib/portal.functions";

export const Route = createFileRoute("/_authenticated/team/")({
  component: SupervisorDashboard,
});

function SupervisorDashboard() {
  const loadDashboard = useServerFn(getSupervisorDashboard);
  const loadTeam = useServerFn(getSupervisorTeam);
  const dashboardQuery = useQuery({
    queryKey: ["supervisor-dashboard"],
    queryFn: () => loadDashboard(),
  });
  const teamQuery = useQuery({ queryKey: ["supervisor-team"], queryFn: () => loadTeam() });

  if (dashboardQuery.isPending || teamQuery.isPending)
    return <LoadingState label="Loading your team dashboard" />;
  if (dashboardQuery.isError) return <ErrorState message={dashboardQuery.error.message} />;
  if (teamQuery.isError) return <ErrorState message={teamQuery.error.message} />;

  return (
    <div className="space-y-6">
      <PageHeader
        breadcrumbs={["Dashboard"]}
        title="Supervisor Dashboard"
        description="A summary of your assigned team and performance review workload."
        actions={
          <Button asChild>
            <Link to="/team/employees">View My Team</Link>
          </Button>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <SummaryCard label="Assigned employees" value={dashboardQuery.data.assignedEmployees} />
        <SummaryCard
          label="Pending self-evaluations"
          value="—"
          description="Available in Phase 2."
        />
        <SummaryCard
          label="Awaiting supervisor review"
          value="—"
          description="Available in Phase 2."
        />
        <SummaryCard label="Completed evaluations" value="—" description="Available in Phase 2." />
        <SummaryCard label="Overdue evaluations" value="—" description="Available in Phase 2." />
      </div>

      {teamQuery.data.length === 0 ? (
        <EmptyState
          title="No employees assigned"
          description="Employees linked to your supervisor account will appear in My Team."
          detail="Team membership is based on the employee record's assigned supervisor."
        />
      ) : (
        <section className="rounded-xl border border-border bg-card p-5">
          <h2 className="text-base font-semibold">Your assigned team</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {teamQuery.data.length} employee record{teamQuery.data.length === 1 ? "" : "s"} assigned
            to your account.
          </p>
        </section>
      )}
    </div>
  );
}
