import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { EmptyState, LoadingBlock, PageHeader } from "@/components/shared/shared-ui";
import { createEmployeeProfile, listEmployees, updateEmployeeProfile } from "@/lib/admin.functions";
import { employeeProfileAdminSchema, type EmployeeProfileAdminValues } from "@/lib/schemas";
import { userErrorMessage } from "@/lib/validation";
import { useStepUp } from "@/components/layout/step-up-provider";

const emptyForm: EmployeeProfileAdminValues = {
  firstName: "",
  middleName: "",
  lastName: "",
  jobTitle: "",
  division: "",
  section: "",
};

type EmployeeProfileRow = EmployeeProfileAdminValues & {
  id: string;
  employee_number: string;
  employment_status: string;
};

export function EmployeeProfileManagementPage() {
  const create = useServerFn(createEmployeeProfile);
  const update = useServerFn(updateEmployeeProfile);
  const fetchEmployees = useServerFn(listEmployees);
  const queryClient = useQueryClient();
  const { runSensitiveAction } = useStepUp();
  const [form, setForm] = useState<EmployeeProfileAdminValues>(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [createdEmployeeId, setCreatedEmployeeId] = useState<string | null>(null);

  const normalizeFieldValue = (key: keyof EmployeeProfileAdminValues, value: string) => {
    return value.toUpperCase();
  };

  const query = useQuery({
    queryKey: ["employee-profiles"],
    queryFn: () => fetchEmployees(),
    retry: false,
  });
  const rows = useMemo(() => {
    const term = search.trim().toLowerCase();
    return ((query.data ?? []) as unknown as EmployeeProfileRow[]).filter(
      (row) =>
        !term ||
        `${row.employee_number} ${row.firstName} ${row.lastName} ${row.jobTitle}`
          .toLowerCase()
          .includes(term),
    );
  }, [query.data, search]);

  const mutation = useMutation({
    mutationFn: async () => {
      const parsed = employeeProfileAdminSchema.parse(form);
      return runSensitiveAction(
        editingId ? "update an employee profile" : "create an employee profile",
        () =>
          editingId
            ? update({ data: { ...parsed, employeeId: editingId } })
            : create({ data: parsed }),
        true,
      );
    },
    onSuccess: async (result) => {
      toast.success(editingId ? "Employee profile updated" : "Employee profile created");
      if (!editingId) setCreatedEmployeeId(result.employeeNumber);
      setForm(emptyForm);
      setEditingId(null);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["employee-profiles"] }),
        queryClient.invalidateQueries({ queryKey: ["employees"] }),
      ]);
    },
    onError: (error) => toast.error(userErrorMessage(error, "Could not save employee profile")),
  });

  function edit(row: EmployeeProfileRow) {
    setEditingId(row.id);
    setForm({
      firstName: row.firstName || (row as never as { first_name: string }).first_name || "",
      middleName: row.middleName || (row as never as { middle_name: string }).middle_name || "",
      lastName: row.lastName || (row as never as { last_name: string }).last_name || "",
      jobTitle: (row as never as { job_title: string }).job_title || "",
      division: (row as never as { division: string }).division || "",
      section: (row as never as { section: string }).section || "",
    });
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Employee profile management"
        description="Manage employee profiles used for evaluation records. Access is limited to System Administrators."
      />
      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            {editingId ? "Edit employee profile" : "Add employee profile"}
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {(
            [
              ["firstName", "First name"],
              ["middleName", "Middle name"],
              ["lastName", "Last name"],
              ["jobTitle", "Job title"],
              ["division", "Division"],
              ["section", "Section"],
            ] as const
          ).map(([key, label]) => (
            <div key={key} className="space-y-1.5">
              <Label htmlFor={`profile-${key}`}>
                {label}
                {["firstName", "lastName"].includes(key) ? " *" : ""}
              </Label>
              <Input
                id={`profile-${key}`}
                className="uppercase"
                value={form[key]}
                onChange={(event) =>
                  setForm((previous) => ({
                    ...previous,
                    [key]: normalizeFieldValue(key, event.target.value),
                  }))
                }
              />
            </div>
          ))}
          {!editingId ? (
            <div className="space-y-1.5">
              <Label htmlFor="profile-employee-id">Employee ID</Label>
              <Input id="profile-employee-id" value="Generated automatically" readOnly />
            </div>
          ) : null}
          <div className="flex items-end gap-2">
            <Button onClick={() => mutation.mutate()} disabled={mutation.isPending}>
              {editingId ? "Save changes" : "Create profile"}
            </Button>
            {editingId ? (
              <Button
                variant="outline"
                onClick={() => {
                  setEditingId(null);
                  setForm(emptyForm);
                }}
              >
                Cancel
              </Button>
            ) : null}
          </div>
        </CardContent>
      </Card>
      <div className="max-w-sm">
        <Input
          placeholder="Search employee profiles"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
      </div>
      {query.isLoading ? (
        <LoadingBlock rows={5} />
      ) : query.isError ? (
        <EmptyState
          title="Employee profiles could not be loaded"
          description={query.error instanceof Error ? query.error.message : "Unavailable"}
        />
      ) : rows.length === 0 ? (
        <EmptyState
          title="No employee profiles"
          description="Create a profile before an employee uses the public evaluation portal."
        />
      ) : (
        <div className="overflow-x-auto border border-border bg-card shadow-sm">
          <table className="w-full min-w-[760px] text-left text-sm">
            <caption className="sr-only">Employee profile management</caption>
            <thead className="border-b border-primary/30 bg-primary text-primary-foreground dark:border-border dark:bg-muted/60 dark:text-foreground">
              <tr>
                {[
                  "Employee ID",
                  "Name",
                  "Job title",
                  "Division",
                  "Section",
                  "Status",
                  "Action",
                ].map((heading) => (
                  <th key={heading} className="px-4 py-3 font-semibold">
                    {heading}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const name =
                  [
                    row.firstName || (row as never as { first_name: string }).first_name,
                    row.middleName || (row as never as { middle_name: string }).middle_name,
                    row.lastName || (row as never as { last_name: string }).last_name,
                  ]
                    .filter(Boolean)
                    .join(" ") || (row as never as { full_name: string }).full_name;
                return (
                  <tr key={row.id} className="border-b last:border-0">
                    <td className="px-4 py-3 tabular-nums">{row.employee_number}</td>
                    <td className="px-4 py-3 font-medium">{name}</td>
                    <td className="px-4 py-3">
                      {(row as never as { job_title: string }).job_title}
                    </td>
                    <td className="px-4 py-3">{(row as never as { division: string }).division}</td>
                    <td className="px-4 py-3">{(row as never as { section: string }).section}</td>
                    <td className="px-4 py-3">{row.employment_status}</td>
                    <td className="px-4 py-3">
                      <Button variant="outline" size="sm" onClick={() => edit(row)}>
                        Edit
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {createdEmployeeId ? (
        <div className="flex items-center gap-3 rounded-md border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm">
          <span>
            Employee created successfully. Employee ID: <strong>{createdEmployeeId}</strong>
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => void navigator.clipboard.writeText(createdEmployeeId)}
          >
            Copy Employee ID
          </Button>
        </div>
      ) : null}
    </div>
  );
}
