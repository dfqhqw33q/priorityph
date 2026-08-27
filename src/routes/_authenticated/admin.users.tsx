import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { ArrowDown, ArrowUp } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { EmptyState, LoadingBlock, PageHeader, ReasonDialog, formatDateTime } from "@/components/ui-bits";
import { useAccess } from "@/hooks/use-access";
import {
  applyUserAccessAction,
  assignRoles,
  createUser,
  getUserSecurityDetail,
  listUsers,
  updateUser,
} from "@/lib/admin.functions";
import { APP_ROLES, ROLE_LABELS, humanizeToken, permissionLabel, type AppRole } from "@/lib/domain";
import { userFormSchema } from "@/lib/schemas";

export const Route = createFileRoute("/_authenticated/admin/users")({
  head: () => ({
    meta: [
      { title: "User accounts | Priority Handling Logistics, Inc." },
      {
        name: "description",
        content:
          "Create and manage internal Administrator, President, HR and Supervisor accounts, roles and account security.",
      },
      { property: "og:title", content: "Internal user management" },
      { property: "og:description", content: "Manage internal accounts, roles and account security." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AdminUsersPage,
});

const ALL = "__all__";
const PAGE_SIZE = 15;

type UserRow = {
  id: string;
  email: string;
  full_name: string;
  job_title: string | null;
  is_active: boolean;
  is_locked: boolean;
  must_change_password: boolean;
  last_login_at: string | null;
  created_at: string;
  roles: AppRole[];
};

type AccessAction =
  | "ACTIVATE"
  | "DEACTIVATE"
  | "LOCK"
  | "UNLOCK"
  | "RESET_PASSWORD"
  | "REQUIRE_PASSWORD_CHANGE"
  | "REVOKE_SESSIONS";

const ACTION_LABELS: Record<AccessAction, string> = {
  ACTIVATE: "Activate account",
  DEACTIVATE: "Deactivate account",
  LOCK: "Lock account",
  UNLOCK: "Unlock account",
  RESET_PASSWORD: "Reset password",
  REQUIRE_PASSWORD_CHANGE: "Require password change",
  REVOKE_SESSIONS: "Sign out of all devices",
};

function AdminUsersPage() {
  const queryClient = useQueryClient();
  const { can, access } = useAccess();

  const fetchUsers = useServerFn(listUsers);
  const create = useServerFn(createUser);
  const update = useServerFn(updateUser);
  const applyAction = useServerFn(applyUserAccessAction);
  const setRoles = useServerFn(assignRoles);
  const fetchSecurity = useServerFn(getUserSecurityDetail);

  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState(ALL);
  const [statusFilter, setStatusFilter] = useState(ALL);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [page, setPage] = useState(0);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [pendingAction, setPendingAction] = useState<AccessAction | null>(null);
  const [rolesDraft, setRolesDraft] = useState<AppRole[]>([]);
  const [rolesDialogOpen, setRolesDialogOpen] = useState(false);
  const [profileDraft, setProfileDraft] = useState({ fullName: "", jobTitle: "" });

  const usersQuery = useQuery({
    queryKey: ["admin-users"],
    queryFn: () => fetchUsers(),
    retry: false,
  });

  const selected = useMemo(
    () => ((usersQuery.data ?? []) as UserRow[]).find((user) => user.id === selectedId) ?? null,
    [usersQuery.data, selectedId],
  );

  const securityQuery = useQuery({
    queryKey: ["user-security", selectedId],
    queryFn: () => fetchSecurity({ data: { userId: selectedId as string } }),
    enabled: selectedId !== null,
    retry: false,
  });

  const rows = useMemo(() => {
    const term = search.trim().toLowerCase();
    let list = ((usersQuery.data ?? []) as UserRow[]).filter((user) => {
      if (term && !`${user.full_name} ${user.email} ${user.job_title ?? ""}`.toLowerCase().includes(term))
        return false;
      if (roleFilter !== ALL && !user.roles.includes(roleFilter as AppRole)) return false;
      if (statusFilter === "ACTIVE" && (!user.is_active || user.is_locked)) return false;
      if (statusFilter === "INACTIVE" && user.is_active) return false;
      if (statusFilter === "LOCKED" && !user.is_locked) return false;
      if (statusFilter === "PASSWORD_RESET" && !user.must_change_password) return false;
      return true;
    });
    list = [...list].sort((a, b) =>
      sortDir === "asc"
        ? a.full_name.localeCompare(b.full_name)
        : b.full_name.localeCompare(a.full_name),
    );
    return list;
  }, [usersQuery.data, search, roleFilter, statusFilter, sortDir]);

  const pageCount = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const current = Math.min(page, pageCount - 1);
  const visible = rows.slice(current * PAGE_SIZE, current * PAGE_SIZE + PAGE_SIZE);

  async function refresh() {
    await queryClient.invalidateQueries({ queryKey: ["admin-users"] });
    await queryClient.invalidateQueries({ queryKey: ["user-security", selectedId] });
    await queryClient.invalidateQueries({ queryKey: ["admin-stats"] });
  }

  const actionMutation = useMutation({
    mutationFn: (input: { action: AccessAction; reason: string }) =>
      applyAction({ data: { userId: selectedId as string, action: input.action, reason: input.reason } }),
    onSuccess: async (result) => {
      toast.success(
        result.temporaryPassword
          ? `Temporary password: ${result.temporaryPassword}`
          : "Change applied",
        result.temporaryPassword ? { duration: 20000 } : undefined,
      );
      setPendingAction(null);
      await refresh();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const rolesMutation = useMutation({
    mutationFn: (reason: string) =>
      setRoles({ data: { userId: selectedId as string, roles: rolesDraft, reason } }),
    onSuccess: async () => {
      toast.success("Roles updated");
      setRolesDialogOpen(false);
      await refresh();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const profileMutation = useMutation({
    mutationFn: () =>
      update({
        data: {
          userId: selectedId as string,
          fullName: profileDraft.fullName,
          jobTitle: profileDraft.jobTitle,
        },
      }),
    onSuccess: async () => {
      toast.success("Profile updated");
      await refresh();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const createMutation = useMutation({
    mutationFn: (values: { email: string; fullName: string; jobTitle: string; roles: AppRole[] }) =>
      create({ data: values }),
    onSuccess: async (result) => {
      toast.success(`User created. Temporary password: ${result.temporaryPassword}`, {
        duration: 30000,
      });
      setCreateOpen(false);
      await refresh();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  if (usersQuery.isError) {
    const message = usersQuery.error instanceof Error ? usersQuery.error.message : "Unavailable";
    return <EmptyState title="You do not have access to user management" description={message} />;
  }

  const removingOwnAdmin =
    selectedId === access?.userId &&
    (selected?.roles.includes("ADMINISTRATOR") ?? false) &&
    !rolesDraft.includes("ADMINISTRATOR");

  return (
    <div className="space-y-6">
      <PageHeader
        title="User accounts"
        description="Accounts for Administrators, HR, Supervisors and the President. Employees do not sign in."
        actions={
          can("users.manage") ? <Button onClick={() => setCreateOpen(true)}>Create user</Button> : null
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <div className="space-y-1.5">
          <Label htmlFor="user-search">Search</Label>
          <Input
            id="user-search"
            placeholder="Name, email or job title"
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              setPage(0);
            }}
          />
        </div>
        <div className="space-y-1.5">
          <Label>Role</Label>
          <Select
            value={roleFilter}
            onValueChange={(value) => {
              setRoleFilter(value);
              setPage(0);
            }}
          >
            <SelectTrigger aria-label="Filter by role">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All roles</SelectItem>
              {APP_ROLES.map((role) => (
                <SelectItem key={role} value={role}>
                  {ROLE_LABELS[role]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Account status</Label>
          <Select
            value={statusFilter}
            onValueChange={(value) => {
              setStatusFilter(value);
              setPage(0);
            }}
          >
            <SelectTrigger aria-label="Filter by account status">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All statuses</SelectItem>
              <SelectItem value="ACTIVE">Active</SelectItem>
              <SelectItem value="INACTIVE">Inactive</SelectItem>
              <SelectItem value="LOCKED">Locked</SelectItem>
              <SelectItem value="PASSWORD_RESET">Password change required</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {usersQuery.isLoading ? (
        <LoadingBlock rows={5} />
      ) : rows.length === 0 ? (
        <EmptyState title="No users match these filters" description="Try clearing the search or filters." />
      ) : (
        <>
          <div className="overflow-x-auto rounded-xl border border-border bg-card shadow-sm">
            <Table>
              <caption className="sr-only">Internal user accounts</caption>
              <TableHeader>
                <TableRow>
                  <TableHead scope="col">
                    <button
                      type="button"
                      className="inline-flex items-center gap-1 font-medium"
                      onClick={() => setSortDir((prev) => (prev === "asc" ? "desc" : "asc"))}
                    >
                      Name
                      {sortDir === "asc" ? <ArrowUp className="size-3" /> : <ArrowDown className="size-3" />}
                    </button>
                  </TableHead>
                  <TableHead scope="col">Email</TableHead>
                  <TableHead scope="col">Roles</TableHead>
                  <TableHead scope="col">Status</TableHead>
                  <TableHead scope="col">Last sign-in</TableHead>
                  <TableHead scope="col" className="text-right">
                    Action
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {visible.map((user) => (
                  <TableRow key={user.id}>
                    <TableCell className="font-medium">
                      {user.full_name}
                      {user.job_title ? (
                        <span className="block text-xs text-muted-foreground">{user.job_title}</span>
                      ) : null}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">{user.email}</TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {user.roles.map((role) => (
                          <Badge key={role} variant="secondary">
                            {ROLE_LABELS[role]}
                          </Badge>
                        ))}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        <Badge variant={user.is_active ? "secondary" : "outline"}>
                          {user.is_active ? "Active" : "Inactive"}
                        </Badge>
                        {user.is_locked ? <Badge variant="destructive">Locked</Badge> : null}
                        {user.must_change_password ? <Badge variant="outline">Password change required</Badge> : null}
                      </div>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {formatDateTime(user.last_login_at)}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setSelectedId(user.id);
                          setRolesDraft(user.roles);
                          setProfileDraft({ fullName: user.full_name, jobTitle: user.job_title ?? "" });
                        }}
                      >
                        Manage
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs text-muted-foreground">
              Showing {current * PAGE_SIZE + 1}–{Math.min(rows.length, (current + 1) * PAGE_SIZE)} of{" "}
              {rows.length}
            </p>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={current === 0}
                onClick={() => setPage((p) => Math.max(0, p - 1))}
              >
                Previous
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={current >= pageCount - 1}
                onClick={() => setPage((p) => p + 1)}
              >
                Next
              </Button>
            </div>
          </div>
        </>
      )}

      <Sheet open={selectedId !== null} onOpenChange={(open) => !open && setSelectedId(null)}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-xl">
          <SheetHeader>
            <SheetTitle>{selected?.full_name ?? "User"}</SheetTitle>
            <SheetDescription>{selected?.email}</SheetDescription>
          </SheetHeader>

          <div className="space-y-6 px-4 pb-10">
            <section className="space-y-3">
              <h3 className="text-sm font-semibold">Profile</h3>
              <div className="space-y-1.5">
                <Label htmlFor="detail-name">Full name</Label>
                <Input
                  id="detail-name"
                  value={profileDraft.fullName}
                  disabled={!can("users.manage")}
                  onChange={(event) =>
                    setProfileDraft((prev) => ({ ...prev, fullName: event.target.value }))
                  }
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="detail-title">Job title</Label>
                <Input
                  id="detail-title"
                  value={profileDraft.jobTitle}
                  disabled={!can("users.manage")}
                  onChange={(event) =>
                    setProfileDraft((prev) => ({ ...prev, jobTitle: event.target.value }))
                  }
                />
              </div>
              {can("users.manage") ? (
                <Button
                  size="sm"
                  onClick={() => profileMutation.mutate()}
                  disabled={profileMutation.isPending}
                >
                  Save profile
                </Button>
              ) : null}
            </section>

            <section className="space-y-3">
              <h3 className="text-sm font-semibold">Role</h3>
              <p className="text-xs text-muted-foreground">
                Each internal user holds exactly one role. Selecting another role replaces the current one.
              </p>
              <RadioGroup
                value={rolesDraft[0] ?? ""}
                disabled={!can("users.assign_roles")}
                onValueChange={(value) => setRolesDraft([value as AppRole])}
                className="space-y-2"
              >
                {APP_ROLES.map((role) => (
                  <div key={role} className="flex items-center gap-2 text-sm">
                    <RadioGroupItem id={`role-${role}`} value={role} />
                    <Label htmlFor={`role-${role}`} className="font-normal">
                      {ROLE_LABELS[role]}
                    </Label>
                  </div>
                ))}
              </RadioGroup>
              {removingOwnAdmin ? (
                <p className="text-xs text-destructive">
                  You are removing your own Administrator access. The server blocks this if you are the
                  last active Administrator.
                </p>
              ) : null}
              {can("users.assign_roles") ? (
                <Button size="sm" onClick={() => setRolesDialogOpen(true)} disabled={rolesDraft.length !== 1}>
                  Update role
                </Button>
              ) : null}
            </section>


            <section className="space-y-3">
              <h3 className="text-sm font-semibold">Account actions</h3>
              <div className="flex flex-wrap gap-2">
                {(Object.keys(ACTION_LABELS) as AccessAction[]).map((action) => (
                  <Button
                    key={action}
                    size="sm"
                    variant="outline"
                    onClick={() => setPendingAction(action)}
                  >
                    {ACTION_LABELS[action]}
                  </Button>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">
                Every action requires a reason and is recorded in the audit trail.
              </p>
            </section>

            <section className="space-y-2">
              <h3 className="text-sm font-semibold">What this user can do</h3>
              {securityQuery.isLoading ? (
                <LoadingBlock rows={2} />
              ) : (securityQuery.data?.permissions ?? []).length === 0 ? (
                <p className="text-sm text-muted-foreground">No permissions granted.</p>
              ) : (
                <div className="flex flex-wrap gap-1">
                  {(securityQuery.data?.permissions ?? []).map((permission) => (
                    <Badge key={permission} variant="outline" className="text-[11px]" title={permission}>
                      {permissionLabel(permission)}
                    </Badge>
                  ))}
                </div>

              )}
            </section>

            <section className="space-y-2">
              <h3 className="text-sm font-semibold">Recent security events</h3>
              {(securityQuery.data?.logins ?? []).length === 0 ? (
                <p className="text-sm text-muted-foreground">No sign-in events recorded.</p>
              ) : (
                <ul className="divide-y divide-border text-sm">
                  {(securityQuery.data?.logins ?? []).map((event) => (
                    <li key={event.id} className="flex justify-between gap-2 py-2">
                      <span>{humanizeToken(event.event_type)}</span>
                      <span className="text-xs text-muted-foreground">
                        {event.result} · {formatDateTime(event.occurred_at)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        </SheetContent>
      </Sheet>

      <ReasonDialog
        open={pendingAction !== null}
        onOpenChange={(open) => !open && setPendingAction(null)}
        title={pendingAction ? ACTION_LABELS[pendingAction] : ""}
        description="This change takes effect immediately and is kept in the activity history."
        confirmLabel="Confirm"
        destructive={pendingAction === "DEACTIVATE" || pendingAction === "LOCK"}
        pending={actionMutation.isPending}
        onConfirm={(reason) =>
          pendingAction && actionMutation.mutate({ action: pendingAction, reason })
        }
      />

      <ReasonDialog
        open={rolesDialogOpen}
        onOpenChange={setRolesDialogOpen}
        title="Change this user's role"
        description="Each user has one role. The role you choose replaces the current one."
        confirmLabel="Update role"
        pending={rolesMutation.isPending}
        onConfirm={(reason) => rolesMutation.mutate(reason)}
      />


      <CreateUserDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        pending={createMutation.isPending}
        onSubmit={(values) => createMutation.mutate(values)}
      />
    </div>
  );
}

function CreateUserDialog({
  open,
  onOpenChange,
  pending,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  pending: boolean;
  onSubmit: (values: { email: string; fullName: string; jobTitle: string; roles: AppRole[] }) => void;
}) {
  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [jobTitle, setJobTitle] = useState("");
  const [roles, setRoles] = useState<AppRole[]>([]);
  const [error, setError] = useState<string | null>(null);

  function submit() {
    const parsed = userFormSchema.safeParse({ email, fullName, jobTitle, roles });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Check the form");
      return;
    }
    setError(null);
    onSubmit(parsed.data);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create a user account</DialogTitle>
          <DialogDescription>
            A temporary password is generated and the user must change it at first sign-in.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="new-email">Email</Label>
            <Input id="new-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="new-name">Full name</Label>
            <Input id="new-name" value={fullName} onChange={(e) => setFullName(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="new-title">Job title</Label>
            <Input id="new-title" value={jobTitle} onChange={(e) => setJobTitle(e.target.value)} />
          </div>
          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">Role</legend>
            <RadioGroup
              value={roles[0] ?? ""}
              onValueChange={(value) => setRoles([value as AppRole])}
              className="space-y-2"
            >
              {APP_ROLES.map((role) => (
                <div key={role} className="flex items-center gap-2 text-sm">
                  <RadioGroupItem id={`new-role-${role}`} value={role} />
                  <Label htmlFor={`new-role-${role}`} className="font-normal">
                    {ROLE_LABELS[role]}
                  </Label>
                </div>
              ))}
            </RadioGroup>
          </fieldset>

          {error ? <p className="text-sm text-destructive">{error}</p> : null}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={pending}>
            {pending ? "Creating…" : "Create user"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
