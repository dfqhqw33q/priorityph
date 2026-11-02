import { createFileRoute } from "@tanstack/react-router";

import { EmptyState, PageHeader } from "@/components/shared/portal-ui";

export const Route = createFileRoute("/_authenticated/notifications")({
  component: NotificationsPage,
});

function NotificationsPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        breadcrumbs={["Notifications"]}
        title="Notifications"
        description="Important updates for your performance management account."
      />
      <EmptyState
        title="No notifications"
        description="You do not have any new notifications. Evaluation updates will appear here when the new workflow is available."
      />
    </div>
  );
}
