import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  EmptyState,
  ErrorState,
  LoadingState,
  PageHeader,
  StatusBadge,
} from "@/components/shared/portal-ui";
import { getMyPortalProfile } from "@/lib/portal.functions";

export const Route = createFileRoute("/_authenticated/profile")({
  component: ProfilePage,
});

function ProfilePage() {
  const loadProfile = useServerFn(getMyPortalProfile);
  const query = useQuery({ queryKey: ["portal-profile"], queryFn: () => loadProfile() });

  if (query.isPending) return <LoadingState label="Loading your profile" />;
  if (query.isError) return <ErrorState message={query.error.message} />;
  const profile = query.data;
  const employee = profile.employee;

  return (
    <div className="space-y-6">
      <PageHeader
        breadcrumbs={["My Profile"]}
        title="My Profile"
        description="Your internal account and employee information."
      />

      <Card>
        <CardHeader>
          <CardTitle className="flex flex-wrap items-center justify-between gap-3">
            <span>Account</span>
            <StatusBadge>{profile.accountStatus}</StatusBadge>
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          <ProfileField label="Full name" value={profile.fullName} />
          <ProfileField label="Email" value={profile.email} />
          <ProfileField label="Portal role" value={profile.role} />
        </CardContent>
      </Card>

      {employee ? (
        <Card>
          <CardHeader>
            <CardTitle>Employee information</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            <ProfileField label="Employee ID" value={employee.employeeNumber} />
            <ProfileField label="Department" value={employee.department} />
            <ProfileField label="Job position" value={employee.position} />
            <ProfileField label="Employment status" value={employee.employmentStatus} />
            <ProfileField label="Date hired" value={employee.hireDate ?? "Not on record"} />
            <ProfileField
              label="Assigned supervisor"
              value={employee.supervisorName ?? "Not assigned"}
            />
          </CardContent>
        </Card>
      ) : (
        <EmptyState
          title="Employee profile is not linked"
          description="Your internal account is active, but there is no linked employee record yet."
          detail="Ask the system owner to link your account to the correct employee record."
        />
      )}
    </div>
  );
}

function ProfileField({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-1 break-words text-sm font-medium text-foreground">{value}</p>
    </div>
  );
}
