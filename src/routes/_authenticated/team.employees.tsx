import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";

import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  EmptyState,
  ErrorState,
  LoadingState,
  PageHeader,
  StatusBadge,
} from "@/components/shared/portal-ui";
import { getSupervisorTeam } from "@/lib/portal.functions";

export const Route = createFileRoute("/_authenticated/team/employees")({
  component: MyTeamPage,
});

function MyTeamPage() {
  const loadTeam = useServerFn(getSupervisorTeam);
  const [search, setSearch] = useState("");
  const query = useQuery({ queryKey: ["supervisor-team"], queryFn: () => loadTeam() });
  const members = useMemo(() => {
    const searchTerm = search.trim().toLowerCase();
    return (query.data ?? []).filter((employee) =>
      `${employee.fullName} ${employee.employeeNumber} ${employee.position} ${employee.department}`
        .toLowerCase()
        .includes(searchTerm),
    );
  }, [query.data, search]);

  if (query.isPending) return <LoadingState label="Loading your assigned team" />;
  if (query.isError) return <ErrorState message={query.error.message} />;

  return (
    <div className="space-y-6">
      <PageHeader
        breadcrumbs={["My Team"]}
        title="My Team"
        description="Employee records assigned to your supervisor account."
      />
      {query.data.length === 0 ? (
        <EmptyState
          title="No employees assigned"
          description="No employee records are currently assigned to you."
        />
      ) : (
        <>
          <div className="max-w-md">
            <Input
              aria-label="Search team"
              placeholder="Search name, employee ID, position, or department"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </div>
          {members.length === 0 ? (
            <EmptyState title="No matching employees" description="Try a different search term." />
          ) : (
            <div className="overflow-x-auto rounded-xl border border-border bg-card">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Employee ID</TableHead>
                    <TableHead>Employee</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Position</TableHead>
                    <TableHead>Department</TableHead>
                    <TableHead>Employment</TableHead>
                    <TableHead>Account</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {members.map((employee) => (
                    <TableRow key={employee.id}>
                      <TableCell className="font-medium">{employee.employeeNumber}</TableCell>
                      <TableCell>{employee.fullName}</TableCell>
                      <TableCell>{employee.email}</TableCell>
                      <TableCell>{employee.position}</TableCell>
                      <TableCell>{employee.department}</TableCell>
                      <TableCell>
                        <StatusBadge>{employee.employmentStatus}</StatusBadge>
                      </TableCell>
                      <TableCell>
                        <StatusBadge>{employee.accountStatus}</StatusBadge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </>
      )}
    </div>
  );
}
