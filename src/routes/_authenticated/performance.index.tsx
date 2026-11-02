import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  EmptyState,
  ErrorState,
  LoadingState,
  PageHeader,
  SummaryCard,
} from "@/components/shared/portal-ui";
import { getEmployeeDashboard, getMyPortalProfile } from "@/lib/portal.functions";

export const Route = createFileRoute("/_authenticated/performance/")({
  component: EmployeeDashboard,
});

function EmployeeDashboard() {
  const loadDashboard = useServerFn(getEmployeeDashboard);
  const loadProfile = useServerFn(getMyPortalProfile);
  const dashboardQuery = useQuery({
    queryKey: ["employee-dashboard"],
    queryFn: () => loadDashboard(),
  });
  const profileQuery = useQuery({
    queryKey: ["portal-profile"],
    queryFn: () => loadProfile(),
  });

  if (dashboardQuery.isPending || profileQuery.isPending)
    return <LoadingState label="Loading your dashboard" />;
  if (dashboardQuery.isError) return <ErrorState message={dashboardQuery.error.message} />;
  if (profileQuery.isError) return <ErrorState message={profileQuery.error.message} />;
  const profile = profileQuery.data;
  const employee = profile.employee;

  return (
    <div className="space-y-6">
      <PageHeader
        breadcrumbs={["Dashboard"]}
        title={`Welcome, ${profile.fullName}`}
        description="Your employee performance portal overview."
      />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <SummaryCard
          label="Current evaluation"
          value={dashboardQuery.data.currentEvaluationAssigned ? "Assigned" : "Not assigned"}
          description="An evaluation period has not been assigned yet."
        />
        <SummaryCard
          label="Evaluation deadline"
          value="—"
          description="Available with an assigned evaluation."
        />
        <SummaryCard
          label="Last evaluation score"
          value="—"
          description="Evaluation history is not available yet."
        />
        <SummaryCard
          label="Supervisor review"
          value="—"
          description="Available when a self-evaluation is submitted."
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Employee information</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <p>
              <span className="text-muted-foreground">Employee ID: </span>
              {employee?.employeeNumber ?? "Not linked"}
            </p>
            <p>
              <span className="text-muted-foreground">Department: </span>
              {employee?.department ?? "Not on record"}
            </p>
            <p>
              <span className="text-muted-foreground">Job position: </span>
              {employee?.position ?? "Not on record"}
            </p>
            <p>
              <span className="text-muted-foreground">Assigned supervisor: </span>
              {employee?.supervisorName ?? "Not assigned"}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Evaluation overview</CardTitle>
          </CardHeader>
          <CardContent>
            <EmptyState
              title="No current evaluation assigned"
              description="Your self-evaluation will appear here when a performance period is assigned to your employee record."
            />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
