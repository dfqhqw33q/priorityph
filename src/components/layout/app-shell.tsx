import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, type ReactNode } from "react";
import {
  Activity,
  Bell,
  BriefcaseBusiness,
  CircleHelp,
  ClipboardCheck,
  Gauge,
  LogOut,
  UserRound,
  Users,
  type LucideIcon,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ThemeModeControls, ThemeToggle } from "@/components/layout/theme-toggle";
import {
  Sidebar,
  SidebarContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  SidebarProvider,
  SidebarInset,
  SidebarFooter,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { supabase } from "@/integrations/supabase/client";
import { recordLoginEvent } from "@/lib/access.functions";
import { ROLE_LABELS, normalizeRole, type AppRole } from "@/lib/domain";
import { useAccess } from "@/hooks/use-access";
import { StepUpProvider } from "@/components/layout/step-up-provider";
import { Skeleton } from "@/components/ui/skeleton";

type NavItem = {
  to: string;
  label: string;
  icon?: LucideIcon;
};

type NavSection = NavItem & {
  children?: NavItem[];
};

const ROUTE_ACCESS: Array<{ prefix: string; roles: AppRole[] }> = [
  { prefix: "/performance", roles: ["EMPLOYEE"] },
  { prefix: "/team", roles: ["SUPERVISOR"] },
  { prefix: "/profile", roles: ["EMPLOYEE", "SUPERVISOR"] },
  { prefix: "/notifications", roles: ["EMPLOYEE", "SUPERVISOR"] },
  { prefix: "/help", roles: ["EMPLOYEE", "SUPERVISOR"] },
  { prefix: "/account/password", roles: ["EMPLOYEE", "SUPERVISOR"] },
];

function routeAccess(pathname: string) {
  return (
    ROUTE_ACCESS.find(({ prefix }) => pathname === prefix || pathname.startsWith(`${prefix}/`)) ??
    null
  );
}

const NAV: Array<{ role: AppRole; sections: NavSection[] }> = [
  {
    role: "EMPLOYEE",
    sections: [
      { to: "/performance", label: "Dashboard", icon: Gauge },
      { to: "/profile", label: "My Profile", icon: UserRound },
      {
        to: "/performance/current",
        label: "My Performance",
        icon: ClipboardCheck,
        children: [
          { to: "/performance/current", label: "Current Evaluation" },
          { to: "/performance/self-evaluation", label: "Self-Evaluation" },
          { to: "/performance/history", label: "Evaluation History" },
        ],
      },
      { to: "/notifications", label: "Notifications", icon: Bell },
      { to: "/help", label: "Help & Support", icon: CircleHelp },
    ],
  },
  {
    role: "SUPERVISOR",
    sections: [
      { to: "/team", label: "Dashboard", icon: Gauge },
      { to: "/profile", label: "My Profile", icon: UserRound },
      { to: "/team/employees", label: "My Team", icon: Users },
      {
        to: "/team/pending",
        label: "Performance Management",
        icon: BriefcaseBusiness,
        children: [
          { to: "/team/pending", label: "Pending Evaluations" },
          { to: "/team/evaluations", label: "Employee Evaluations" },
          { to: "/team/completed", label: "Completed Evaluations" },
          { to: "/team/history", label: "Evaluation History" },
        ],
      },
      { to: "/notifications", label: "Notifications", icon: Bell },
    ],
  },
];

function NavLinks({ onNavigate }: { onNavigate?: () => void }) {
  const { access } = useAccess();
  const { isMobile, setOpenMobile } = useSidebar();
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const accessRoles = new Set(
    (access?.roles ?? [])
      .map((role) => normalizeRole(role))
      .filter((role): role is AppRole => Boolean(role)),
  );
  const group = NAV.find((item) => accessRoles.has(item.role));
  if (!group) return null;

  const navigate = () => {
    onNavigate?.();
    if (isMobile) setOpenMobile(false);
  };
  return (
    <SidebarMenu>
      {group.sections.map((section) => {
        const Icon = section.icon;
        const active = section.children
          ? pathname === section.to || pathname.startsWith(`${section.to}/`)
          : pathname === section.to;
        if (!section.children) {
          return (
            <SidebarMenuItem key={section.label}>
              <SidebarMenuButton asChild isActive={active} tooltip={section.label}>
                <Link to={section.to} onClick={navigate}>
                  {Icon ? <Icon className="size-4" /> : null}
                  <span>{section.label}</span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          );
        }
        return (
          <SidebarMenuItem key={section.label}>
            <Collapsible defaultOpen={active} className="group/collapsible">
              <CollapsibleTrigger asChild>
                <SidebarMenuButton className="w-full" tooltip={section.label}>
                  {Icon ? <Icon className="size-4" /> : null}
                  <span>{section.label}</span>
                  <span className="ml-auto text-xs" aria-hidden="true">
                    ›
                  </span>
                </SidebarMenuButton>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <SidebarMenuSub>
                  {section.children.map((child) => {
                    const childActive =
                      pathname === child.to || pathname.startsWith(`${child.to}/`);
                    return (
                      <SidebarMenuSubItem key={child.label}>
                        <SidebarMenuSubButton asChild isActive={childActive}>
                          <Link to={child.to} onClick={navigate}>
                            {child.label}
                          </Link>
                        </SidebarMenuSubButton>
                      </SidebarMenuSubItem>
                    );
                  })}
                </SidebarMenuSub>
              </CollapsibleContent>
            </Collapsible>
          </SidebarMenuItem>
        );
      })}
    </SidebarMenu>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const { access, isLoading, isError } = useAccess();
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const queryClient = useQueryClient();
  const logEvent = useServerFn(recordLoginEvent);
  const accessRule = routeAccess(pathname);
  const normalizedRoles = new Set(
    (access?.roles ?? [])
      .map((role) => normalizeRole(role))
      .filter((role): role is AppRole => Boolean(role)),
  );
  const hasAnyRequiredRole = (requiredRoles: AppRole[]) =>
    requiredRoles.some((role) => normalizedRoles.has(role));
  const passwordChangeRequired =
    !isLoading &&
    !isError &&
    access?.mustChangePassword === true &&
    pathname !== "/account/password";
  const accessDenied =
    !isLoading &&
    !isError &&
    (access === null ||
      !access.isActive ||
      access.isLocked ||
      accessRule === null ||
      normalizedRoles.size !== 1 ||
      !hasAnyRequiredRole(accessRule.roles));

  useEffect(() => {
    if (accessDenied) navigate({ to: "/unauthorized", replace: true });
    else if (passwordChangeRequired) navigate({ to: "/account/password", replace: true });
  }, [accessDenied, navigate, passwordChangeRequired]);

  if (isLoading) {
    return (
      <div className="flex min-h-screen bg-background">
        <aside className="hidden w-64 shrink-0 border-r border-border bg-card p-4 md:block">
          <Skeleton className="h-10 w-40" />
          <div className="mt-8 space-y-3">
            {Array.from({ length: 5 }).map((_, index) => (
              <Skeleton key={index} className="h-9 w-full rounded-md" />
            ))}
          </div>
        </aside>
        <main className="min-w-0 flex-1 p-6">
          <div className="flex items-center justify-between border-b border-border pb-5">
            <Skeleton className="h-8 w-40" />
            <div className="flex gap-3">
              <Skeleton className="size-9 rounded-full" />
              <Skeleton className="size-9 rounded-full" />
            </div>
          </div>
          <div className="mt-6 space-y-4">
            <Skeleton className="h-5 w-52" />
            <Skeleton className="h-3 w-72 max-w-full" />
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              {Array.from({ length: 2 }).map((_, index) => (
                <div key={index} className="rounded-xl border border-border bg-card p-6 shadow-sm">
                  <Skeleton className="h-3 w-20" />
                  <Skeleton className="mt-3 h-8 w-16" />
                </div>
              ))}
            </div>
          </div>
        </main>
      </div>
    );
  }
  if (accessDenied) return null;

  async function signOut() {
    void logEvent({ data: { event: "LOGOUT" } }).catch(() => undefined);
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
    navigate({ to: "/login", replace: true });
  }

  return (
    <StepUpProvider>
      <SidebarProvider>
        <Sidebar collapsible="icon" className="border-r border-border bg-card">
          <SidebarHeader className="flex h-16 shrink-0 items-center border-b border-sidebar-border bg-sidebar px-5 text-sidebar-foreground">
            <Link to="/" className="flex min-w-0 translate-y-1 items-center gap-3">
              <img
                src="/logo-optimized.webp"
                alt="Priority Handling Logistics, Inc."
                className="size-10 shrink-0 object-contain"
              />
              <span className="min-w-0 text-[11px] font-bold uppercase leading-[1.08] tracking-[0.02em] text-sidebar-foreground group-data-[collapsible=icon]:hidden">
                PRIORITY HANDLING
                <br />
                LOGISTICS INC.
              </span>
            </Link>
          </SidebarHeader>
          <SidebarContent className="px-3 py-5">
            <NavLinks />
          </SidebarContent>
          <SidebarFooter className="border-t border-sidebar-border px-3 py-3">
            <div className="flex flex-col gap-2">
              <div className="flex min-w-0 items-center justify-between gap-2">
                <span className="text-xs font-medium text-sidebar-foreground/70 group-data-[collapsible=icon]:hidden">
                  Theme
                </span>
                <ThemeModeControls className="flex items-center gap-0.5 group-data-[collapsible=icon]:hidden" />
                <ThemeToggle className="hidden size-7 group-data-[collapsible=icon]:inline-flex" />
              </div>
              <div className="flex items-center gap-2 group-data-[collapsible=icon]:justify-center">
                <SidebarTrigger
                  aria-label="Collapse or expand sidebar"
                  title="Collapse or expand sidebar"
                />
                <span className="text-xs font-medium text-sidebar-foreground/70 group-data-[collapsible=icon]:hidden">
                  Collapse
                </span>
              </div>
            </div>
          </SidebarFooter>
        </Sidebar>

        <SidebarInset>
          <header className="sticky top-0 z-30 border-b border-border bg-background/95 backdrop-blur-sm">
            <div className="flex h-16 items-center gap-3 px-4 sm:px-6">
              <SidebarTrigger className="md:hidden" aria-label="Open sidebar" />
              <div className="ml-auto flex items-center gap-3">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="outline"
                      size="icon"
                      className="rounded-full"
                      aria-label="Open profile menu"
                    >
                      <Avatar className="size-8">
                        <AvatarFallback className="bg-primary text-primary-foreground">
                          <UserRound className="size-4" />
                        </AvatarFallback>
                      </Avatar>
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-56">
                    <DropdownMenuLabel>
                      <p className="font-semibold text-foreground">{access?.fullName}</p>
                      <p className="font-normal text-muted-foreground">
                        {(access?.roles ?? []).map((role) => ROLE_LABELS[role]).join(" \u00b7 ") ||
                          "No role assigned"}
                      </p>
                    </DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={signOut} className="gap-2">
                      <LogOut className="size-4" />
                      Sign out
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>
          </header>

          <main className="mx-auto w-full max-w-[1440px] min-w-0 flex-1 space-y-6 px-4 py-6 sm:px-6">
            {children}
          </main>
        </SidebarInset>
      </SidebarProvider>
    </StepUpProvider>
  );
}
