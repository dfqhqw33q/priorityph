import { Bell, CheckCheck } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { supabase } from "@/integrations/supabase/client";
import {
  listMyNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  type AppNotification,
} from "@/lib/notifications.functions";
import { useAccess } from "@/hooks/use-access";
import { formatDateTime } from "@/components/shared/shared-ui";

export function NotificationCenter() {
  const { access } = useAccess();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const fetchNotifications = useServerFn(listMyNotifications);
  const markRead = useServerFn(markNotificationRead);
  const markAllRead = useServerFn(markAllNotificationsRead);
  const seenEventIds = useRef(new Set<string>());
  const initialized = useRef(false);
  const [open, setOpen] = useState(false);
  const query = useQuery({
    queryKey: ["my-notifications"],
    queryFn: () => fetchNotifications({ data: { limit: 50 } }),
    enabled: Boolean(access?.userId),
    retry: false,
    staleTime: 30_000,
  });
  const notifications = (query.data ?? []).filter(
    (notification, index, all) =>
      all.findIndex((item) => item.eventId === notification.eventId) === index,
  );
  const unreadCount = notifications.filter((notification) => !notification.readAt).length;

  useEffect(() => {
    if (!access?.userId) return;
    const channel = supabase
      .channel(`user-notifications:${access.userId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "user_notifications",
          filter: `user_id=eq.${access.userId}`,
        },
        async (payload) => {
          const incoming = await fetchNotifications({
            data: { limit: 1, notificationId: String(payload.new.id) },
          });
          const notification = incoming[0];
          if (!notification) return;
          queryClient.setQueryData<AppNotification[]>(["my-notifications"], (current = []) => {
            const merged = [
              notification,
              ...current.filter(
                (item) => item.id !== notification.id && item.eventId !== notification.eventId,
              ),
            ];
            return merged.slice(0, 50);
          });
          if (initialized.current && !seenEventIds.current.has(notification.eventId)) {
            toast.success(notification.title, {
              description: notification.message,
              duration: 6000,
              className: "min-w-[320px]",
            });
          }
          seenEventIds.current.add(notification.eventId);
          initialized.current = true;
        },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [access?.userId, fetchNotifications, queryClient]);

  useEffect(() => {
    if (!query.data) return;
    query.data.forEach((notification) => seenEventIds.current.add(notification.eventId));
    initialized.current = true;
  }, [query.data]);

  const openNotification = async (notification: AppNotification) => {
    if (!notification.readAt) {
      await markRead({ data: { id: notification.id } });
      await queryClient.invalidateQueries({ queryKey: ["my-notifications"] });
    }
    setOpen(false);
    if (notification.targetPath) navigate({ to: notification.targetPath as never });
  };

  const markAll = async () => {
    await markAllRead();
    await queryClient.invalidateQueries({ queryKey: ["my-notifications"] });
  };

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative"
          aria-label={`Notifications${unreadCount ? `, ${unreadCount} unread` : ""}`}
        >
          <Bell className="size-4" />
          {unreadCount > 0 ? (
            <span className="absolute -right-1 -top-1 flex min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] leading-4 text-primary-foreground">
              {unreadCount > 99 ? "99+" : unreadCount}
            </span>
          ) : null}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-[min(24rem,calc(100vw-2rem))] p-0">
        <div className="flex items-center justify-between px-4 py-3">
          <DropdownMenuLabel className="p-0">Notifications</DropdownMenuLabel>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 gap-1 text-xs"
            disabled={!unreadCount}
            onClick={markAll}
          >
            <CheckCheck className="size-3.5" />
            Mark all read
          </Button>
        </div>
        <DropdownMenuSeparator className="m-0" />
        <div className="max-h-[min(28rem,70vh)] overflow-y-auto">
          {notifications.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-muted-foreground">No notifications</p>
          ) : (
            notifications.map((notification) => (
              <button
                key={notification.id}
                type="button"
                onClick={() => void openNotification(notification)}
                className={`block w-full border-b border-border px-4 py-3 text-left transition-colors hover:bg-muted/60 ${notification.readAt ? "bg-background" : "bg-primary/5"}`}
              >
                <div className="flex items-start gap-2">
                  <span
                    className={`mt-1.5 size-2 shrink-0 rounded-full ${notification.readAt ? "bg-transparent" : "bg-primary"}`}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold text-foreground">
                      {notification.title}
                    </span>
                    <span className="mt-0.5 block text-xs text-muted-foreground">
                      {notification.message}
                    </span>
                    <span className="mt-1 block text-[11px] text-muted-foreground">
                      {formatDateTime(notification.occurredAt)}
                    </span>
                  </span>
                </div>
              </button>
            ))
          )}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

