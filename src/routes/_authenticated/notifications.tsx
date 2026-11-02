import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { EmptyState, ErrorState, LoadingState, PageHeader } from "@/components/shared/portal-ui";
import {
  getMyPerformanceNotifications,
  markMyPerformanceNotificationRead,
} from "@/lib/performance-notification.functions";

export const Route = createFileRoute("/_authenticated/notifications")({
  component: NotificationsPage,
});

function NotificationsPage() {
  const queryClient = useQueryClient();
  const loadNotifications = useServerFn(getMyPerformanceNotifications);
  const markRead = useServerFn(markMyPerformanceNotificationRead);
  const query = useQuery({
    queryKey: ["my-performance-notifications"],
    queryFn: () => loadNotifications(),
  });
  const mutation = useMutation({
    mutationFn: (notificationId: string) => markRead({ data: { notificationId } }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["my-performance-notifications"] });
    },
    onError: (error) => toast.error(error.message),
  });
  if (query.isPending) return <LoadingState label="Loading notifications" />;
  if (query.isError) return <ErrorState message={query.error.message} />;
  return (
    <div className="space-y-6">
      <PageHeader
        breadcrumbs={["Notifications"]}
        title="Notifications"
        description="Important updates for your performance management account."
      />
      {query.data.length ? (
        <div className="space-y-3">
          {query.data.map((notification) => (
            <article
              key={notification.id}
              className={`rounded-xl border bg-card p-4 ${notification.readAt ? "border-border" : "border-primary/50"}`}
            >
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="space-y-1">
                  <p className="font-semibold">{notification.title}</p>
                  <p className="text-sm text-muted-foreground">{notification.message}</p>
                  {notification.evaluationId ? (
                    <p className="text-xs font-medium text-muted-foreground">
                      Evaluation {notification.evaluationId.slice(0, 8).toUpperCase()}
                    </p>
                  ) : null}
                  <p className="text-xs text-muted-foreground">
                    {new Date(notification.createdAt).toLocaleString()}
                    {!notification.readAt ? " · Unread" : ""}
                  </p>
                </div>
                <div className="flex shrink-0 gap-2">
                  {notification.href ? (
                    <Button asChild size="sm" variant="outline">
                      <a href={notification.href}>Open evaluation</a>
                    </Button>
                  ) : null}
                  {!notification.readAt ? (
                    <Button
                      size="sm"
                      disabled={mutation.isPending}
                      onClick={() => mutation.mutate(notification.id)}
                    >
                      Mark read
                    </Button>
                  ) : null}
                </div>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <EmptyState
          title="No notifications"
          description="Workflow notifications will appear here."
        />
      )}
    </div>
  );
}
