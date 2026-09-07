import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, type ReactNode } from "react";
import {
  ClipboardList,
  FileClock,
  Gauge,
  Activity,
  BriefcaseBusiness,
  Handshake,
  History,
  Medal,
  Settings,
  Shield,
  Users,
  UserCog,
  BadgeCheck,
  BrainCircuit,
  GraduationCap,
  LogOut,
  User,
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
import { ThemeToggle } from "@/components/theme-toggle";
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
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { supabase } from "@/integrations/supabase/client";
import { recordLoginEvent } from "@/lib/access.functions";
import { APP_NAME, ROLE_LABELS, type AppRole, type Permission } from "@/lib/domain";
import { useAccess } from "@/hooks/use-access";

type NavItem = {
  to?: string;
  label: string;
  icon?: typeof Gauge;
  permission?: Permission;
  roles?: AppRole[];
};

type NavCategory = NavItem & { children: NavItem[] };

const ROUTE_ACCESS: Array<{ prefix: string; roles: AppRole[]; permission?: Permission }> = [
  { prefix: "/admin/users", roles: ["ADMINISTRATOR"], permission: "users.view" },
  { prefix: "/admin/roles", roles: ["ADMINISTRATOR"], permission: "roles.manage" },
  { prefix: "/admin/employees", roles: ["ADMINISTRATOR"], permission: "employees.view" },
  { prefix: "/admin/audit-logs", roles: ["ADMINISTRATOR"], permission: "audit.view" },
  { prefix: "/admin", roles: ["ADMINISTRATOR"], permission: "users.view" },
  { prefix: "/president/employees", roles: ["PRESIDENT"], permission: "evaluations.view_201" },
  { prefix: "/hr/employees", roles: ["HR"], permission: "evaluations.view_201" },
  { prefix: "/hr/competency", roles: ["HR"], permission: "evaluations.view_201" },
  {
    prefix: "/hr/evaluation-history",
    roles: ["HR", "PRESIDENT"],
    permission: "evaluations.view_201",
  },
  { prefix: "/hr", roles: ["HR"], permission: "cycles.view" },
  { prefix: "/supervisor", roles: ["SUPERVISOR"], permission: "evaluations.view_step1" },
  { prefix: "/president", roles: ["PRESIDENT"], permission: "president.view" },
  {
    prefix: "/reviewing-supervisor",
    roles: ["REVIEWING_SUPERVISOR"],
    permission: "evaluations.review_step3",
  },
  { prefix: "/personnel", roles: ["HR"], permission: "personnel.process" },
  { prefix: "/committee", roles: ["COMMITTEE"], permission: "committee.review" },
];

function routeAccess(pathname: string) {
  return (
    ROUTE_ACCESS.find(({ prefix }) => pathname === prefix || pathname.startsWith(`${prefix}/`)) ??
    null
  );
}

const NAV: Array<{ roles: AppRole[]; direct: NavItem[]; categories: NavCategory[] }> = [
  {
    roles: ["HR"],
    direct: [
      { to: "/hr", label: "Dashboard", icon: Gauge, permission: "cycles.view" },
      { label: "Reports", icon: FileClock },
      { label: "Settings", icon: Settings },
    ],
    categories: [
      {
        label: "Employees",
        icon: Users,
        children: [
          { to: "/hr/employees", label: "Directory", permission: "evaluations.view_201" },
          { to: "/hr/employees", label: "201 Files", permission: "evaluations.view_201" },
        ],
      },
      {
        label: "Performance",
        icon: ClipboardList,
        children: [
          { to: "/hr/cycles", label: "Evaluation Cycles", permission: "cycles.view" },
          { to: "/hr/evaluation-history", label: "History", permission: "evaluations.view_201" },
        ],
      },
      {
        label: "Competencies",
        icon: BrainCircuit,
        children: [
          { to: "/hr/competency", label: "Profiles", permission: "evaluations.view_201" },
          { label: "Gaps" },
        ],
      },
      { label: "Development", icon: GraduationCap, children: [{ label: "Development Records" }] },
      { label: "Training", icon: BriefcaseBusiness, children: [{ label: "Recommendations" }] },
      { label: "Career", icon: Handshake, children: [{ label: "Succession" }] },
      { label: "Recognition", icon: Medal, children: [{ label: "Recognition" }] },
      {
        label: "Processing",
        icon: ClipboardList,
        children: [{ to: "/personnel", label: "For Review", permission: "personnel.process" }],
      },
    ],
  },
  {
    roles: ["SUPERVISOR"],
    direct: [
      { to: "/supervisor", label: "Dashboard", icon: Gauge, permission: "evaluations.view_step1" },
      { label: "History", icon: History },
    ],
    categories: [
      {
        label: "Evaluations",
        icon: ClipboardList,
        children: [
          {
            to: "/supervisor/evaluations",
            label: "To Review",
            permission: "evaluations.view_step1",
          },
          { label: "Completed" },
        ],
      },
    ],
  },
  {
    roles: ["REVIEWING_SUPERVISOR"],
    direct: [
      {
        to: "/reviewing-supervisor",
        label: "Dashboard",
        icon: Gauge,
        permission: "evaluations.review_step3",
      },
      { label: "History", icon: History },
    ],
    categories: [
      {
        label: "Evaluations",
        icon: ClipboardList,
        children: [
          {
            to: "/reviewing-supervisor",
            label: "To Review",
            permission: "evaluations.review_step3",
          },
          { label: "Completed" },
        ],
      },
    ],
  },
  {
    roles: ["COMMITTEE"],
    direct: [
      { to: "/committee", label: "Dashboard", icon: Gauge, permission: "committee.review" },
      { label: "History", icon: History },
    ],
    categories: [
      {
        label: "Evaluations",
        icon: ClipboardList,
        children: [
          { to: "/committee", label: "To Review", permission: "committee.review" },
          { label: "Completed" },
        ],
      },
    ],
  },
  {
    roles: ["PRESIDENT"],
    direct: [
      { to: "/president", label: "Dashboard", icon: Gauge, permission: "president.view" },
      { label: "History", icon: History },
    ],
    categories: [
      {
        label: "Approvals",
        icon: BadgeCheck,
        children: [
          { to: "/president/evaluations", label: "Pending", permission: "president.view" },
          { label: "Returned" },
          { label: "Completed" },
        ],
      },
    ],
  },
  {
    roles: ["ADMINISTRATOR"],
    direct: [
      { to: "/admin", label: "Dashboard", icon: Shield, permission: "users.view" },
      { to: "/admin/audit-logs", label: "Audit Logs", icon: FileClock, permission: "audit.view" },
      { label: "Activity", icon: Activity },
    ],
    categories: [
      {
        label: "Users",
        icon: UserCog,
        children: [
          { to: "/admin/users", label: "User List", permission: "users.view" },
          { to: "/admin/roles", label: "Roles & Permissions", permission: "roles.manage" },
        ],
      },
      {
        label: "Employees",
        icon: Users,
        children: [
          { to: "/admin/employees", label: "Records", permission: "employees.view" },
          { to: "/admin/employee-profiles", label: "Profiles", permission: "employees.manage" },
        ],
      },
    ],
  },
];

function NavLinks({ onNavigate }: { onNavigate?: () => void }) {
  const { access, can } = useAccess();
  const { isMobile, setOpenMobile } = useSidebar();
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const group = NAV.find((item) => item.roles.some((role) => (access?.roles ?? []).includes(role)));
  if (!group) return null;

  const allowed = (item: NavItem) => !item.permission || can(item.permission);
  const navigate = () => {
    onNavigate?.();
    if (isMobile) setOpenMobile(false);
  };
  const direct = group.direct.filter(allowed);
  const categories = group.categories
    .map((category) => ({ ...category, children: category.children.filter(allowed) }))
    .filter((category) => category.children.length > 0);

  const renderItem = (item: NavItem, active = false) => {
    const Icon = item.icon;
    if (!item.to)
      return (
        <SidebarMenuButton type="button">
          {Icon ? <Icon className="size-4" /> : null}
          <span>{item.label}</span>
        </SidebarMenuButton>
      );
    return (
      <SidebarMenuButton asChild isActive={active}>
        <Link to={item.to} onClick={navigate}>
          {Icon ? <Icon className="size-4" /> : null}
          <span>{item.label}</span>
        </Link>
      </SidebarMenuButton>
    );
  };

  return (
    <SidebarMenu>
      {direct.map((item) => (
        <SidebarMenuItem key={item.label}>
          {renderItem(item, Boolean(item.to && pathname.startsWith(item.to)))}
        </SidebarMenuItem>
      ))}
      {categories.map((category) => {
        const activeChild = category.children.some(
          (child) => child.to && (pathname === child.to || pathname.startsWith(`${child.to}/`)),
        );
        const CategoryIcon = category.icon;
        return (
          <SidebarMenuItem key={category.label}>
            <Collapsible defaultOpen={activeChild} className="group/collapsible">
              <CollapsibleTrigger asChild>
                <SidebarMenuButton className="w-full">
                  {CategoryIcon ? <CategoryIcon className="size-4" /> : null}
                  <span>{category.label}</span>
                  <span className="ml-auto text-xs" aria-hidden="true">
                    ›
                  </span>
                </SidebarMenuButton>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <SidebarMenuSub>
                  {category.children.map((child) => {
                    const childActive = Boolean(
                      child.to && (pathname === child.to || pathname.startsWith(`${child.to}/`)),
                    );
                    return (
                      <SidebarMenuSubItem key={child.label}>
                        {child.to ? (
                          <SidebarMenuSubButton asChild isActive={childActive}>
                            <Link to={child.to} onClick={navigate}>
                              {child.label}
                            </Link>
                          </SidebarMenuSubButton>
                        ) : (
                          <SidebarMenuSubButton>{child.label}</SidebarMenuSubButton>
                        )}
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
  const accessDenied =
    !isLoading &&
    !isError &&
    (access === null ||
      !access.isActive ||
      access.isLocked ||
      (accessRule !== null &&
        (!accessRule.roles.some((role) => access.roles.includes(role)) ||
          (accessRule.permission !== undefined &&
            !access.permissions.includes(accessRule.permission)))));

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
    <SidebarProvider>
      <Sidebar collapsible="none" className="border-r border-border bg-card">
        <SidebarHeader className="flex h-16 shrink-0 items-center border-b border-border px-4">
          <Link to="/" className="flex items-center gap-2">
            <img
              src="/priority-handling-logo.png"
              alt="Priority Handling Logistics, Inc."
              className="h-8 w-auto max-w-44 object-contain"
            />
            <span className="sr-only">{APP_NAME}</span>
          </Link>
        </SidebarHeader>
        <SidebarContent className="px-3 py-5">
          <NavLinks />
        </SidebarContent>
      </Sidebar>

      <SidebarInset>
        <header className="sticky top-0 z-30 border-b border-border bg-background/95 backdrop-blur-sm">
          <div className="flex h-16 items-center gap-3 px-4 sm:px-6">
            <SidebarTrigger className="md:hidden" aria-label="Open navigation" />

            <Link to="/" className="flex items-center gap-3 lg:hidden">
              <img
                src="/priority-handling-logo.png"
                alt="Priority Handling Logistics, Inc."
                className="h-8 w-auto max-w-40 object-contain"
              />
            </Link>

            <div className="ml-auto flex items-center gap-3">
              <ThemeToggle />
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
                        <User className="size-4" />
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
  );
}
