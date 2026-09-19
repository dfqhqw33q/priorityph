import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";

import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { EmptyState, LoadingBlock, PageHeader } from "@/components/shared/shared-ui";
import { listDigital201Employees } from "@/lib/reports.functions";

export const Route = createFileRoute("/_authenticated/hr/competency/")({
  component: CompetencyIndexPage,
});

function CompetencyIndexPage() {
  const fetchEmployees = useServerFn(listDigital201Employees);
  const [search, setSearch] = useState("");
  const query = useQuery({
    queryKey: ["competency-employees"],
    queryFn: () => fetchEmployees({}),
    retry: false,
  });
  const employees = (query.data ?? []).filter((employee) =>
    `${employee.full_name} ${employee.employee_number} ${employee.division ?? ""}`
      .toLowerCase()
      .includes(search.toLowerCase()),
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Competency Management"
        description="Review employee strengths and development areas from completed evaluations."
      />
      <Card>
        <CardContent className="pt-6">
          <Input
            aria-label="Search employees"
            placeholder="Search employee name or number"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </CardContent>
      </Card>
      {query.isLoading ? (
        <LoadingBlock rows={6} />
      ) : query.isError ? (
        <EmptyState
          title="Competency employees could not be loaded"
          description={(query.error as Error).message}
        />
      ) : employees.length === 0 ? (
        <EmptyState
          title="No employees found"
          description="Only existing employee records are shown here."
        />
      ) : (
        <div className="border border-border bg-card shadow-sm">
          <Table>
            <caption className="sr-only">Employees with competency profiles</caption>
            <TableHeader>
              <TableRow>
                <TableHead>Employee ID</TableHead>
                <TableHead>Full Name</TableHead>
                <TableHead>Job Title</TableHead>
                <TableHead>Division / Department</TableHead>
                <TableHead>Section / Unit</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {employees.map((employee) => (
                <TableRow key={employee.id}>
                  <TableCell className="whitespace-nowrap">
                    <Link
                      className="font-normal text-foreground hover:text-primary hover:underline"
                      to="/hr/competency/$employeeId"
                      params={{ employeeId: employee.id }}
                    >
                      {employee.employee_number}
                    </Link>
                  </TableCell>
                  <TableCell>
                    <Link
                      className="font-normal text-foreground hover:text-primary hover:underline"
                      to="/hr/competency/$employeeId"
                      params={{ employeeId: employee.id }}
                    >
                      {employee.full_name}
                    </Link>
                  </TableCell>
                  <TableCell>{employee.job_title || "-"}</TableCell>
                  <TableCell>{employee.division || "-"}</TableCell>
                  <TableCell>{employee.section || "-"}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {employee.employment_status || "-"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
