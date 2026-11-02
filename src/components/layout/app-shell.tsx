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
import { ROLE_LABELS, normalizeRole, type AppRole, type Permission } from "@/lib/domain";
import { useAccess } from "@/hooks/use-access";
import { StepUpProvider } from "@/components/layout/step-up-provider";
import { Skeleton } from "@/components/ui/skeleton";

type NavItem = {
  to: string;
  label: string;
  icon?: LucideIcon;
  permission?: Permission;
};

type NavSection = NavItem & {
  children?: NavItem[];
};

const SHARED_ROLES: AppRole[] = [
  "EMPLOYEE",
  "SUPERVISOR",
  "DEPARTMENT_HEAD",
  "HR",
  "ADMINISTRATOR",
  "OPERATIONS_MANAGER",
];
const ROUTE_ACCESS: Array<{
  prefix: string;
  roles: AppRole[];
  permission?: Permission;
}> = [
  {
    prefix: "/performance/competencies",
    roles: ["EMPLOYEE"],
    permission: "competencies.assessments.view",
  },
  { prefix: "/performance", roles: ["EMPLOYEE"] },
  {
    prefix: "/team/competencies",
    roles: ["SUPERVISOR"],
    permission: "competencies.framework.view",
  },
  { prefix: "/team", roles: ["SUPERVISOR"] },
  { prefix: "/operations", roles: ["OPERATIONS_MANAGER"], permission: "operations.learning.view" },
  {
    prefix: "/department/competencies",
    roles: ["DEPARTMENT_HEAD"],
    permission: "competencies.gaps.view",
  },
  { prefix: "/department", roles: ["DEPARTMENT_HEAD"], permission: "performance.department.view" },
  { prefix: "/hr/competencies", roles: ["HR"], permission: "competencies.framework.view" },
  { prefix: "/hr/cycles", roles: ["HR"], permission: "performance.cycles.view" },
  { prefix: "/hr/assignments", roles: ["HR"], permission: "performance.assignments.manage" },
  { prefix: "/hr/profiles", roles: ["HR"], permission: "performance.profiles.manage" },
  { prefix: "/hr/monitoring", roles: ["HR"], permission: "performance.monitoring.view" },
  { prefix: "/hr/approvals", roles: ["HR"], permission: "performance.hr_validation.view" },
  { prefix: "/hr/returned", roles: ["HR"], permission: "performance.hr_validation.view" },
  { prefix: "/hr/finalized", roles: ["HR"], permission: "performance.history.view" },
  { prefix: "/hr", roles: ["HR"], permission: "performance.monitoring.view" },
  { prefix: "/profile", roles: SHARED_ROLES },
  { prefix: "/notifications", roles: SHARED_ROLES },
  { prefix: "/help", roles: SHARED_ROLES },
  { prefix: "/account/password", roles: SHARED_ROLES },
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
      {
        to: "/performance/competencies",
        label: "My Competencies",
        icon: Activity,
        permission: "competencies.assessments.view",
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
        to: "/team/competencies",
        label: "Competency Management",
        icon: Activity,
        permission: "competencies.framework.view",
      },
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
  {
    role: "DEPARTMENT_HEAD",
    sections: [
      { to: "/department", label: "Department Dashboard", icon: Gauge },
      {
        to: "/department/performance",
        label: "Department Performance",
        icon: BriefcaseBusiness,
        permission: "performance.department.view",
        children: [
          {
            to: "/department/pending",
            label: "Pending Performance Approvals",
            permission: "performance.department_approval.view",
          },
          {
            to: "/department/approved",
            label: "Approved Evaluations",
            permission: "performance.department_history.view",
          },
          {
            to: "/department/returned",
            label: "Returned Evaluations",
            permission: "performance.department_approval.view",
          },
          {
            to: "/department/history",
            label: "Department Evaluation History",
            permission: "performance.department_history.view",
          },
        ],
      },
      {
        to: "/department/competencies",
        label: "Competency & Gap Overview",
        icon: Activity,
        permission: "competencies.gaps.view",
      },
      {
        to: "/department/learning",
        label: "Learning & Training Overview",
        icon: BriefcaseBusiness,
      },
      { to: "/department/succession", label: "Succession Planning", icon: Users },
      { to: "/department/recognition", label: "Recognition Overview", icon: ClipboardCheck },
      { to: "/department/reports", label: "Department Reports", icon: Activity },
      { to: "/department/delegated", label: "Delegated Approvals", icon: ClipboardCheck },
      { to: "/notifications", label: "Notifications", icon: Bell },
      { to: "/profile", label: "My Profile", icon: UserRound },
    ],
  },
  {
    role: "HR",
    sections: [
      { to: "/hr", label: "Dashboard", icon: Gauge },
      { to: "/hr/employees", label: "Employee Management", icon: Users },
      {
        to: "/hr/monitoring",
        label: "Performance Management",
        icon: BriefcaseBusiness,
        permission: "performance.monitoring.view",
        children: [
          { to: "/hr/cycles", label: "Evaluation Cycles", permission: "performance.cycles.view" },
          {
            to: "/hr/assignments",
            label: "Evaluation Assignments",
            permission: "performance.assignments.manage",
          },
          {
            to: "/hr/profiles",
            label: "Evaluation Profiles",
            permission: "performance.profiles.manage",
          },
          {
            to: "/hr/monitoring",
            label: "Performance Monitoring",
            permission: "performance.monitoring.view",
          },
          {
            to: "/hr/finalized",
            label: "Evaluation History",
            permission: "performance.history.view",
          },
        ],
      },
      {
        to: "/hr/competencies",
        label: "Competency Management",
        icon: Activity,
        permission: "competencies.framework.view",
      },
      { to: "/hr/succession", label: "Succession Planning", icon: Users },
      { to: "/hr/recognition", label: "Social Recognition", icon: ClipboardCheck },
      { to: "/hr/reports", label: "HR Reports & Analytics", icon: Activity },
      {
        to: "/hr/approvals",
        label: "Approval Center",
        icon: ClipboardCheck,
        permission: "performance.hr_validation.view",
        children: [
          {
            to: "/hr/approvals",
            label: "Pending HR Validation",
            permission: "performance.hr_validation.view",
          },
          {
            to: "/hr/returned",
            label: "Returned for Correction",
            permission: "performance.hr_validation.view",
          },
          {
            to: "/hr/finalized",
            label: "Finalized Evaluations",
            permission: "performance.history.view",
          },
        ],
      },
      { to: "/notifications", label: "Notifications", icon: Bell },
      { to: "/profile", label: "My Profile", icon: UserRound },
    ],
  },
  {
    role: "OPERATIONS_MANAGER",
    sections: [
      {
        to: "/operations",
        label: "Dashboard",
        icon: Gauge,
        permission: "operations.learning.view",
      },
      {
        to: "/operations/competencies",
        label: "Competency Gaps",
        icon: Activity,
        permission: "competencies.gaps.view",
      },
      {
        to: "/operations/recommendations",
        label: "AI Recommendations",
        icon: Activity,
        permission: "operations.recommendations.review",
      },
      {
        to: "/operations/development-plans",
        label: "Development Plans",
        icon: ClipboardCheck,
        permission: "operations.learning.manage",
      },
      {
        to: "/operations/courses",
        label: "Course & Learning Content Management",
        icon: BriefcaseBusiness,
        permission: "operations.learning.manage",
      },
      {
        to: "/operations/learning-paths",
        label: "Learning Paths",
        icon: Activity,
        permission: "operations.learning.manage",
      },
      {
        to: "/operations/quizzes",
        label: "Quiz & Assessment Management",
        icon: ClipboardCheck,
        permission: "operations.learning.manage",
      },
      {
        to: "/operations/learners",
        label: "Learner Progress",
        icon: Users,
        permission: "operations.learning.view",
      },
      {
        to: "/operations/calendar",
        label: "Training Calendar",
        icon: Activity,
        permission: "operations.learning.view",
      },
      {
        to: "/operations/sessions",
        label: "Training Sessions & Attendance",
        icon: ClipboardCheck,
        permission: "operations.learning.manage",
      },
      {
        to: "/operations/reassessments",
        label: "Assessment & Reassessment",
        icon: ClipboardCheck,
        permission: "competencies.gaps.view",
      },
      {
        to: "/operations/effectiveness",
        label: "Training Effectiveness",
        icon: Activity,
        permission: "operations.learning.view",
      },
      {
        to: "/operations/reports",
        label: "Learning & Training Reports",
        icon: Activity,
        permission: "operations.learning.view",
      },
      { to: "/notifications", label: "Notifications", icon: Bell },
      { to: "/profile", label: "My Profile", icon: UserRound },
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
  const hasPermission = (permission?: Permission) =>
    permission === undefined || access?.permissions.includes(permission) === true;

  const navigate = () => {
    onNavigate?.();
    if (isMobile) setOpenMobile(false);
  };
  return (
    <SidebarMenu>
      {group.sections
        .filter((section) => hasPermission(section.permission))
        .map((section) => {
          const Icon = section.icon;
          const children = section.children?.filter((child) => hasPermission(child.permission));
          const active = children?.length
            ? pathname === section.to || pathname.startsWith(`${section.to}/`)
            : pathname === section.to;
          if (!children?.length) {
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
                    {children.map((child) => {
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
  const hasRequiredPermission =
    !accessRule?.permission || access?.permissions.includes(accessRule.permission) === true;
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
      !hasAnyRequiredRole(accessRule.roles) ||
      !hasRequiredPermission);

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
