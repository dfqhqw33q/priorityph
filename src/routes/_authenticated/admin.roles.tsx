import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { EmptyState, LoadingBlock, PageHeader, ReasonDialog } from "@/components/ui-bits";
import { useAccess } from "@/hooks/use-access";
import { listRoleMatrix, listUsers, setRolePermissions } from "@/lib/admin.functions";
import { APP_ROLES, ROLE_LABELS, permissionLabel, type AppRole, type Permission } from "@/lib/domain";

export const Route = createFileRoute("/_authenticated/admin/roles")({
  head: () => ({
    meta: [
      { title: "Roles & permissions | Priority Handling Logistics, Inc." },
      {
        name: "description",
        content: "Review and adjust the permissions granted to each role, with reasons recorded in the audit trail.",
      },
      { property: "og:title", content: "Roles and permissions" },
      { property: "og:description", content: "Permission matrix for Administrator, President, HR and Supervisor." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AdminRolesPage,
});

type UserRow = { id: string; full_name: string; email: string; roles: AppRole[] };

function AdminRolesPage() {
  const queryClient = useQueryClient();
  const { can } = useAccess();
  const fetchMatrix = useServerFn(listRoleMatrix);
  const fetchUsers = useServerFn(listUsers);
  const savePermissions = useServerFn(setRolePermissions);

  const [role, setRole] = useState<AppRole>("ADMINISTRATOR");
  const [draft, setDraft] = useState<Permission[]>([]);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const matrixQuery = useQuery({
    queryKey: ["role-matrix"],
    queryFn: () => fetchMatrix(),
    retry: false,
  });

  const usersQuery = useQuery({
    queryKey: ["admin-users"],
    queryFn: () => fetchUsers(),
    retry: false,
    enabled: can("users.view"),
  });

  const grantedByRole = useMemo(() => {
    const map = new Map<AppRole, Permission[]>();
    for (const row of matrixQuery.data?.mapping ?? []) {
      const key = row.role_code as AppRole;
      map.set(key, [...(map.get(key) ?? []), row.permission_code as Permission]);
    }
    return map;
  }, [matrixQuery.data]);

  useEffect(() => {
    setDraft(grantedByRole.get(role) ?? []);
  }, [role, grantedByRole]);

  const grouped = useMemo(() => {
    const groups = new Map<string, { code: Permission; description: string }[]>();
    for (const permission of matrixQuery.data?.permissions ?? []) {
      const module = permission.module;
      groups.set(module, [
        ...(groups.get(module) ?? []),
        { code: permission.code as Permission, description: permission.description },
      ]);
    }
    return [...groups.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [matrixQuery.data]);

  const mutation = useMutation({
    mutationFn: (reason: string) => savePermissions({ data: { role, permissions: draft, reason } }),
    onSuccess: async () => {
      toast.success("Permissions updated");
      setConfirmOpen(false);
      await queryClient.invalidateQueries({ queryKey: ["role-matrix"] });
      await queryClient.invalidateQueries({ queryKey: ["access"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  if (matrixQuery.isError) {
    const message = matrixQuery.error instanceof Error ? matrixQuery.error.message : "Unavailable";
    return <EmptyState title="You do not have access to role management" description={message} />;
  }
  if (matrixQuery.isLoading) return <LoadingBlock rows={6} />;

  const granted = grantedByRole.get(role) ?? [];
  const changed =
    draft.length !== granted.length || draft.some((permission) => !granted.includes(permission));
  const roleUsers = ((usersQuery.data ?? []) as UserRow[]).filter((user) => user.roles.includes(role));

  return (
    <div className="space-y-6">
      <PageHeader
        title="Roles & permissions"
        description="Choose what each role is allowed to do. Administrator and President access stay separate."
      />

      <Tabs value={role} onValueChange={(value) => setRole(value as AppRole)}>
        <TabsList className="flex-wrap">
          {APP_ROLES.map((code) => (
            <TabsTrigger key={code} value={code}>
              {ROLE_LABELS[code]}
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value={role} className="space-y-4 pt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">{ROLE_LABELS[role]} permissions</CardTitle>
              <CardDescription>
                {draft.length} of {(matrixQuery.data?.permissions ?? []).length} permissions granted.
                Changes require a reason and are audited.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {grouped.map(([module, permissions]) => (
                <fieldset key={module} className="space-y-2">
                  <legend className="text-sm font-semibold">{module}</legend>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {permissions.map((permission) => (
                      <label key={permission.code} className="flex items-start gap-2 text-sm">
                        <Checkbox
                          className="mt-0.5"
                          checked={draft.includes(permission.code)}
                          disabled={!can("permissions.manage")}
                          onCheckedChange={(checked) =>
                            setDraft((prev) =>
                              checked
                                ? [...prev, permission.code]
                                : prev.filter((item) => item !== permission.code),
                            )
                          }
                        />
                        <span>
                          <span className="text-xs font-semibold">{permissionLabel(permission.code)}</span>
                          <span className="block text-xs text-muted-foreground">
                            {permission.description}
                          </span>
                        </span>
                      </label>
                    ))}
                  </div>
                </fieldset>
              ))}

              {can("permissions.manage") ? (
                <div className="flex flex-wrap gap-2">
                  <Button disabled={!changed} onClick={() => setConfirmOpen(true)}>
                    Save permissions
                  </Button>
                  <Button variant="outline" disabled={!changed} onClick={() => setDraft(granted)}>
                    Reset
                  </Button>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  You can review permissions but not change them.
                </p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Users with this role</CardTitle>
            </CardHeader>
            <CardContent>
              {!can("users.view") ? (
                <p className="text-sm text-muted-foreground">
                  You do not have permission to view user assignments.
                </p>
              ) : roleUsers.length === 0 ? (
                <p className="text-sm text-muted-foreground">No users hold this role.</p>
              ) : (
                <ul className="divide-y divide-border text-sm">
                  {roleUsers.map((user) => (
                    <li key={user.id} className="flex flex-wrap justify-between gap-2 py-2">
                      <span className="font-medium">{user.full_name}</span>
                      <span className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                        {user.email}
                        {user.roles.map((code) => (
                          <Badge key={code} variant="outline">
                            {ROLE_LABELS[code]}
                          </Badge>
                        ))}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <ReasonDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title={`Update ${ROLE_LABELS[role]} permissions`}
        description="Administrators must always keep permission management access."
        confirmLabel="Save changes"
        pending={mutation.isPending}
        onConfirm={(reason) => mutation.mutate(reason)}
      />
    </div>
  );
}
