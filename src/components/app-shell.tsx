import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState, type ReactNode } from "react";
import {
  ClipboardList,
  FileClock,
  Gauge,
  LogOut,
  Menu,
  Shield,
  Users,
  CalendarRange,
  UserCog,
  BadgeCheck,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/theme-toggle";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { supabase } from "@/integrations/supabase/client";
import { recordLoginEvent } from "@/lib/access.functions";
import { APP_NAME, ROLE_LABELS, type AppRole, type Permission } from "@/lib/domain";
import { useAccess } from "@/hooks/use-access";
import { cn } from "@/lib/utils";

type NavItem = { to: string; label: string; icon: typeof Gauge; permission?: Permission; roles?: AppRole[] };

const ROUTE_ACCESS: Array<{ prefix: string; roles: AppRole[]; permission?: Permission }> = [
  { prefix: "/admin/users", roles: ["ADMINISTRATOR"], permission: "users.view" },
  { prefix: "/admin/roles", roles: ["ADMINISTRATOR"], permission: "roles.manage" },
  { prefix: "/admin/employees", roles: ["ADMINISTRATOR"], permission: "employees.view" },
  { prefix: "/admin/audit-logs", roles: ["ADMINISTRATOR"], permission: "audit.view" },
  { prefix: "/admin", roles: ["ADMINISTRATOR"], permission: "users.view" },
  { prefix: "/president/employees", roles: ["PRESIDENT"], permission: "employees.view" },
  { prefix: "/hr/evaluation-history", roles: ["HR", "SUPERVISOR"], permission: "evaluations.view_history" },
  { prefix: "/hr", roles: ["HR"], permission: "cycles.view" },
  { prefix: "/supervisor", roles: ["SUPERVISOR"], permission: "evaluations.view_step1" },
  { prefix: "/president", roles: ["PRESIDENT"], permission: "president.view" },
];

function routeAccess(pathname: string) {
  return (
    ROUTE_ACCESS.find(({ prefix }) => pathname === prefix || pathname.startsWith(`${prefix}/`)) ?? null
  );
}

const NAV: { group: string; items: NavItem[] }[] = [
  {
    group: "HR / Personnel",
    items: [
      { to: "/hr/cycles", label: "Evaluation cycles", icon: CalendarRange, permission: "cycles.view", roles: ["HR"] },
      { to: "/hr/evaluation-history", label: "Evaluation history", icon: FileClock, permission: "evaluations.view_history", roles: ["HR"] },
    ],
  },

  {
    group: "Supervisor",
    items: [
      { to: "/supervisor", label: "Dashboard", icon: Gauge, permission: "evaluations.view_step1", roles: ["SUPERVISOR"] },
      {
        to: "/supervisor/evaluations",
        label: "Evaluations to review",
        icon: ClipboardList,
        permission: "evaluations.view_step1",
        roles: ["SUPERVISOR"],
      },
      { to: "/hr/evaluation-history", label: "Evaluation history", icon: FileClock, permission: "evaluations.view_history", roles: ["SUPERVISOR"] },
    ],
  },
  {
    group: "President",
    items: [
      { to: "/president", label: "Dashboard", icon: Gauge, permission: "president.view", roles: ["PRESIDENT"] },
      { to: "/president/evaluations", label: "Evaluations to review", icon: BadgeCheck, permission: "president.view", roles: ["PRESIDENT"] },
      { to: "/president/employees", label: "Employee records", icon: Users, permission: "employees.view", roles: ["PRESIDENT"] },
    ],

  },
  {
    group: "Administration",
    items: [
      { to: "/admin", label: "Overview", icon: Shield, permission: "users.view", roles: ["ADMINISTRATOR"] },
      { to: "/admin/users", label: "User accounts", icon: Users, permission: "users.view", roles: ["ADMINISTRATOR"] },
      { to: "/admin/roles", label: "Roles & permissions", icon: UserCog, permission: "roles.manage", roles: ["ADMINISTRATOR"] },
      { to: "/admin/employees", label: "Employee records", icon: Users, permission: "employees.view", roles: ["ADMINISTRATOR"] },
      { to: "/admin/audit-logs", label: "Audit logs", icon: FileClock, permission: "audit.view", roles: ["ADMINISTRATOR"] },
    ],
  },
];

function NavLinks({ onNavigate }: { onNavigate?: () => void }) {
  const { access, can } = useAccess();
  const pathname = useRouterState({ select: (state) => state.location.pathname });

  return (
    <nav className="space-y-6">
      {NAV.map((group) => {
        const items = group.items.filter(
          (item) =>
            (!item.roles || item.roles.some((role) => (access?.roles ?? []).includes(role))) &&
            (!item.permission || can(item.permission)),
        );
        if (items.length === 0) return null;
        return (
          <div key={group.group}>
            <p className="px-3 text-xs font-bold uppercase tracking-wider text-muted-foreground">
              {group.group}
            </p>
            <div className="mt-2 space-y-1">
              {items.map((item) => {
                const active = pathname === item.to || pathname.startsWith(`${item.to}/`);
                const Icon = item.icon;
                return (
                  <Link
                    key={item.to}
                    to={item.to}
                    onClick={onNavigate}
                    className={cn(
                      "flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-all",
                      active
                        ? "bg-primary text-primary-foreground font-semibold shadow-sm"
                        : "text-foreground hover:bg-accent hover:text-accent-foreground",
                    )}
                  >
                    <Icon className={cn("size-4 shrink-0", active ? "text-primary-foreground" : "text-muted-foreground")} />
                    <span>{item.label}</span>
                  </Link>
                );
              })}
            </div>
          </div>
        );
      })}
    </nav>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const { access, isLoading } = useAccess();
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const queryClient = useQueryClient();
  const logEvent = useServerFn(recordLoginEvent);
  const [open, setOpen] = useState(false);
  const accessRule = routeAccess(pathname);
  const accessDenied =
    !isLoading &&
    (access === null ||
      !access.isActive ||
      access.isLocked ||
      (accessRule !== null &&
        (!accessRule.roles.some((role) => access.roles.includes(role)) ||
          (accessRule.permission !== undefined && !access.permissions.includes(accessRule.permission)))));

  useEffect(() => {
    if (accessDenied) navigate({ to: "/unauthorized", replace: true });
  }, [accessDenied, navigate]);

  if (isLoading || accessDenied) return null;

  async function signOut() {
    try {
      await logEvent({ data: { event: "LOGOUT" } });
    } catch {
      // Sign-out proceeds even if the audit call fails.
    }
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
    navigate({ to: "/login", replace: true });
  }

  return (
    <div className="min-h-screen bg-background lg:flex">
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-64 shrink-0 flex-col border-r border-border bg-card lg:flex">
        <div className="flex h-16 shrink-0 items-center border-b border-border px-4">
          <Link to="/" className="flex items-center gap-2">
            <img
              src="/priority-handling-logo.png"
              alt="Priority Handling Logistics, Inc."
              className="h-8 w-auto max-w-44 object-contain"
            />
            <span className="sr-only">{APP_NAME}</span>
          </Link>
        </div>
        <div className="flex-1 overflow-y-auto px-3 py-5">
          <NavLinks />
        </div>
      </aside>

      <div className="flex min-h-screen w-full min-w-0 flex-1 flex-col lg:pl-64">
        <header className="sticky top-0 z-30 border-b border-border bg-background/95 backdrop-blur-sm">
          <div className="flex h-16 items-center gap-3 px-4 sm:px-6">
            <Sheet open={open} onOpenChange={setOpen}>
              <SheetTrigger asChild>
                <Button variant="ghost" size="icon" className="lg:hidden" aria-label="Open navigation">
                  <Menu className="size-5" />
                </Button>
              </SheetTrigger>
              <SheetContent side="left" className="w-72 overflow-y-auto p-4 border-r border-border bg-background">
                <SheetTitle className="mb-4 text-base font-bold text-foreground">{APP_NAME}</SheetTitle>
                <NavLinks onNavigate={() => setOpen(false)} />
              </SheetContent>
            </Sheet>

            <Link to="/" className="flex items-center gap-3 lg:hidden">
              <img
                src="/priority-handling-logo.png"
                alt="Priority Handling Logistics, Inc."
                className="h-8 w-auto max-w-40 object-contain"
              />
            </Link>

            <div className="ml-auto flex items-center gap-3">
              <div className="hidden text-right sm:block">
                <p className="text-sm font-semibold leading-tight text-foreground">{access?.fullName}</p>
                <p className="text-xs text-muted-foreground">
                  {(access?.roles ?? []).map((role) => ROLE_LABELS[role]).join(" \u00b7 ") || "No role assigned"}
                </p>
              </div>
              <ThemeToggle />
              <Button variant="outline" size="sm" onClick={signOut} className="gap-1.5 font-medium">
                <LogOut className="size-4" />
                <span className="hidden sm:inline">Sign out</span>
              </Button>
            </div>
          </div>
        </header>

        <main className="mx-auto w-full max-w-[1440px] min-w-0 flex-1 space-y-6 px-4 py-6 sm:px-6">{children}</main>
      </div>
    </div>
  );
}
