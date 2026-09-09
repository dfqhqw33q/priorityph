import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";

import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
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
    `${employee.full_name} ${employee.employee_number} ${employee.department ?? employee.division ?? ""}`
      .toLowerCase()
      .includes(search.toLowerCase()),
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Competency Management"
        description="Read-only competency profiles derived from finalized Annual Performance Evaluations."
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
        <div className="overflow-x-auto rounded-xl border border-border bg-card shadow-sm">
          <table className="w-full text-left text-sm">
            <caption className="sr-only">Employees with competency profiles</caption>
            <thead className="border-b border-border bg-muted/60">
              <tr>
                {["Employee", "Position", "Division", "Status"].map((heading) => (
                  <th key={heading} className="px-4 py-3 font-semibold">
                    {heading}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {employees.map((employee) => (
                <tr
                  key={employee.id}
                  className="border-b border-border last:border-0 hover:bg-muted/30"
                >
                  <td className="px-4 py-3">
                    <Link
                      className="font-semibold text-primary hover:underline"
                      to="/hr/competency/$employeeId"
                      params={{ employeeId: employee.id }}
                    >
                      {employee.full_name}
                    </Link>
                    <p className="text-xs text-muted-foreground">{employee.employee_number}</p>
                  </td>
                  <td className="px-4 py-3">{employee.job_title || "â€”"}</td>
                  <td className="px-4 py-3">{employee.division || "â€”"}</td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">
                    {employee.employment_status || "â€”"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

