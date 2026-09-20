import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { useDebouncedValue } from "@/hooks/use-debounced-value";

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
import { listDigital201EmployeesPage } from "@/lib/reports.functions";

export const Route = createFileRoute("/_authenticated/hr/competency/")({
  component: CompetencyIndexPage,
});

function CompetencyIndexPage() {
  const fetchEmployees = useServerFn(listDigital201EmployeesPage);
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedValue(search);
  const [page, setPage] = useState(0);
  const query = useQuery({
    queryKey: ["competency-employees", { search: debouncedSearch, page }],
    queryFn: () => fetchEmployees({ data: { search: debouncedSearch, page, pageSize: 25 } }),
    retry: false,
  });
  const employees = query.data?.rows ?? [];
  const total = query.data?.total ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / 25));

  return (
    <div className="space-y-6">
      <PageHeader
        title="Competency Profiles"
        description="Review employee strengths and development areas from completed evaluations."
      />
      <Card>
        <CardContent className="pt-6">
          <Input
            aria-label="Search employees"
            placeholder="Search employee name or number"
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              setPage(0);
            }}
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
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-4 py-3">
            <p className="text-xs text-muted-foreground">
              Showing {total === 0 ? 0 : page * 25 + 1}-{Math.min(total, (page + 1) * 25)} of{" "}
              {total}
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                className="rounded-md border border-border px-3 py-1.5 text-xs disabled:opacity-50"
                disabled={page === 0}
                onClick={() => setPage((value) => Math.max(0, value - 1))}
              >
                Previous
              </button>
              <button
                type="button"
                className="rounded-md border border-border px-3 py-1.5 text-xs disabled:opacity-50"
                disabled={page >= pageCount - 1}
                onClick={() => setPage((value) => value + 1)}
              >
                Next
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
