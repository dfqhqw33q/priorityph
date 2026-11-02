import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { PageHeader, StatusBadge } from "@/components/shared/portal-ui";
import { useAccess } from "@/hooks/use-access";
import {
  assignDepartmentHead,
  assignEmployeesToCycle,
  getDepartmentHeadSetup,
  getEvaluationAssignmentSetup,
} from "@/lib/performance-admin.functions";

export const Route = createFileRoute("/_authenticated/hr/assignments")({
  component: EvaluationAssignmentsPage,
});

function EvaluationAssignmentsPage() {
  const { can } = useAccess();
  const queryClient = useQueryClient();
  const loadSetup = useServerFn(getEvaluationAssignmentSetup);
  const loadHeadSetup = useServerFn(getDepartmentHeadSetup);
  const assign = useServerFn(assignEmployeesToCycle);
  const assignHead = useServerFn(assignDepartmentHead);
  const [periodId, setPeriodId] = useState("");
  const [selectedEmployees, setSelectedEmployees] = useState<string[]>([]);
  const [search, setSearch] = useState("");
  const [departmentId, setDepartmentId] = useState("");
  const [departmentHeadUserId, setDepartmentHeadUserId] = useState("");
  const canManageHeads = can("performance.department_assignments.manage") || can("users.manage");
  const query = useQuery({
    queryKey: ["evaluation-assignment-setup"],
    queryFn: () => loadSetup(),
  });
  const headSetupQuery = useQuery({
    queryKey: ["department-head-setup"],
    queryFn: () => loadHeadSetup(),
    enabled: canManageHeads,
  });
  const assignmentMutation = useMutation({
    mutationFn: () => assign({ data: { periodId, employeeIds: selectedEmployees } }),
    onSuccess: async (result) => {
      toast.success(`${result.assigned} employee evaluation assignment(s) created.`);
      setSelectedEmployees([]);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["evaluation-assignment-setup"] }),
        queryClient.invalidateQueries({ queryKey: ["evaluation-cycles"] }),
      ]);
    },
    onError: (error) => toast.error(error.message),
  });
  const headMutation = useMutation({
    mutationFn: () => assignHead({ data: { departmentId, departmentHeadUserId } }),
    onSuccess: async () => {
      toast.success("Department Head assignment saved.");
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["department-head-setup"] }),
        queryClient.invalidateQueries({ queryKey: ["evaluation-cycles"] }),
      ]);
    },
    onError: (error) => toast.error(error.message),
  });
  const eligible = useMemo(() => {
    const assigned = new Set(
      (query.data?.assignments ?? [])
        .filter((assignment) => assignment.periodId === periodId)
        .map((assignment) => assignment.employeeNumber),
    );
    const normalized = search.trim().toLowerCase();
    return (query.data?.employees ?? []).filter(
      (employee) =>
        !assigned.has(employee.employeeNumber) &&
        (!normalized ||
          `${employee.name} ${employee.employeeNumber} ${employee.department}`
            .toLowerCase()
            .includes(normalized)),
    );
  }, [periodId, query.data, search]);

  return (
    <div className="space-y-6">
      <PageHeader
        breadcrumbs={["Performance Management", "Evaluation Assignments"]}
        title="Evaluation Assignments"
        description="Assign active employees to a draft evaluation cycle using their effective position profile and assigned Supervisor."
      />
      {canManageHeads ? (
        <Card>
          <CardHeader>
            <CardTitle>Department Head assignments</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Department Heads are assigned to stable department records. Each active department
              needs an authorized head before a cycle can launch.
            </p>
            {headSetupQuery.isPending ? (
              <p className="text-sm text-muted-foreground">Loading department assignments…</p>
            ) : null}
            {headSetupQuery.isError ? (
              <p role="alert" className="text-sm text-destructive">
                {headSetupQuery.error.message}
              </p>
            ) : null}
            {headSetupQuery.data?.departments.map((department) => (
              <div
                key={department.id}
                className="grid gap-3 rounded-md border border-border p-3 md:grid-cols-[1fr_1fr_auto] md:items-center"
              >
                <div>
                  <p className="font-medium">{department.label}</p>
                  <p className="text-xs text-muted-foreground">
                    Current: {department.currentHead ?? "No Department Head"}
                  </p>
                </div>
                <select
                  aria-label={`Department Head for ${department.label}`}
                  className="h-10 rounded-md border border-input bg-background px-3"
                  value={
                    departmentId === department.id
                      ? departmentHeadUserId
                      : (department.currentHeadId ?? "")
                  }
                  onChange={(event) => {
                    setDepartmentId(department.id);
                    setDepartmentHeadUserId(event.currentTarget.value);
                  }}
                >
                  <option value="">Select a Department Head</option>
                  {headSetupQuery.data.departmentHeads.map((head) => (
                    <option key={head.id} value={head.id}>
                      {head.fullName} · {head.email}
                    </option>
                  ))}
                </select>
                <Button
                  size="sm"
                  disabled={
                    !departmentId ||
                    !departmentHeadUserId ||
                    departmentId !== department.id ||
                    headMutation.isPending
                  }
                  onClick={() => headMutation.mutate()}
                >
                  Save assignment
                </Button>
              </div>
            ))}
            {!headSetupQuery.data?.departments.length && !headSetupQuery.isPending ? (
              <p className="text-sm text-muted-foreground">
                No departments are linked to active employee records.
              </p>
            ) : null}
          </CardContent>
        </Card>
      ) : null}
      <Card>
        <CardHeader>
          <CardTitle>Assign employees</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {query.isPending ? (
            <p className="text-sm text-muted-foreground">Loading assignment options…</p>
          ) : null}
          {query.isError ? (
            <p role="alert" className="text-sm text-destructive">
              {query.error.message}
            </p>
          ) : null}
          {query.data ? (
            <>
              <label className="block space-y-1 text-sm">
                <span>Draft cycle</span>
                <select
                  className="h-10 w-full rounded-md border border-input bg-background px-3"
                  value={periodId}
                  onChange={(event) => {
                    setPeriodId(event.currentTarget.value);
                    setSelectedEmployees([]);
                  }}
                >
                  <option value="">Select a cycle</option>
                  {query.data.periods
                    .filter((period) => period.status === "DRAFT")
                    .map((period) => (
                      <option key={period.id} value={period.id}>
                        {period.name}
                      </option>
                    ))}
                </select>
              </label>
              <Input
                placeholder="Search eligible employees"
                value={search}
                onChange={(event) => setSearch(event.currentTarget.value)}
              />
              <div className="max-h-80 overflow-y-auto rounded-md border border-border">
                {eligible.map((employee) => (
                  <label
                    key={employee.id}
                    className="flex cursor-pointer items-center gap-3 border-b border-border p-3 last:border-0"
                  >
                    <input
                      type="checkbox"
                      checked={selectedEmployees.includes(employee.id)}
                      disabled={!periodId}
                      onChange={(event) =>
                        setSelectedEmployees((current) =>
                          event.currentTarget.checked
                            ? [...current, employee.id]
                            : current.filter((id) => id !== employee.id),
                        )
                      }
                    />
                    <span className="min-w-0">
                      <span className="block font-medium">
                        {employee.name} · {employee.employeeNumber}
                      </span>
                      <span className="block text-xs text-muted-foreground">
                        {employee.department}
                      </span>
                    </span>
                  </label>
                ))}
                {!eligible.length ? (
                  <p className="p-4 text-sm text-muted-foreground">
                    No unassigned employees match.
                  </p>
                ) : null}
              </div>
              <Button
                disabled={!periodId || !selectedEmployees.length || assignmentMutation.isPending}
                onClick={() => assignmentMutation.mutate()}
              >
                {assignmentMutation.isPending
                  ? "Assigning…"
                  : `Assign ${selectedEmployees.length} employee(s)`}
              </Button>
            </>
          ) : null}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Current assignments</CardTitle>
        </CardHeader>
        <CardContent>
          {query.data?.assignments.length ? (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[650px] text-left text-sm">
                <thead className="border-b border-border text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="px-3 py-3">Employee</th>
                    <th className="px-3 py-3">Cycle</th>
                    <th className="px-3 py-3">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {query.data.assignments.map((assignment) => (
                    <tr key={assignment.id}>
                      <td className="px-3 py-3">
                        {assignment.employeeName} · {assignment.employeeNumber}
                      </td>
                      <td className="px-3 py-3">{assignment.periodName}</td>
                      <td className="px-3 py-3">
                        <StatusBadge>{assignment.status}</StatusBadge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No employee assignments yet.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
