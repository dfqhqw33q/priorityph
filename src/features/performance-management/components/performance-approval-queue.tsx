import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";

import {
  EmptyState,
  ErrorState,
  LoadingState,
  PageHeader,
  StatusBadge,
} from "@/components/shared/portal-ui";
import { Input } from "@/components/ui/input";
import {
  getPerformanceApprovalQueue,
  type PerformanceApprovalQueueRow,
} from "@/lib/performance-approval.functions";

type Props = {
  lane:
    | "DEPARTMENT_PENDING"
    | "DEPARTMENT_APPROVED"
    | "DEPARTMENT_RETURNED"
    | "DEPARTMENT_HISTORY"
    | "HR_PENDING"
    | "HR_RETURNED"
    | "HR_FINALIZED";
  title: string;
  description: string;
  department?: boolean;
};

const PAGE_SIZE = 10;

export function PerformanceApprovalQueue({ lane, title, description, department = false }: Props) {
  const loadQueue = useServerFn(getPerformanceApprovalQueue);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [sortBy, setSortBy] = useState("recent");
  const [page, setPage] = useState(0);
  const query = useQuery({
    queryKey: ["performance-approval-queue", lane],
    queryFn: () => loadQueue({ data: { lane } }),
  });

  const rows = useMemo(() => {
    const source = query.data ?? [];
    const normalizedSearch = search.trim().toLowerCase();
    return source
      .filter((row) => {
        const matchesSearch =
          !normalizedSearch ||
          [
            row.reference,
            row.employeeName,
            row.employeeNumber,
            row.position,
            row.department,
            row.supervisorName,
            row.departmentHeadName,
            row.periodName,
          ]
            .join(" ")
            .toLowerCase()
            .includes(normalizedSearch);
        return matchesSearch && (statusFilter === "ALL" || row.status === statusFilter);
      })
      .sort((left, right) => {
        if (sortBy === "employee") return left.employeeName.localeCompare(right.employeeName);
        if (sortBy === "employee-score")
          return (right.employeeScore ?? 0) - (left.employeeScore ?? 0);
        if (sortBy === "supervisor-score")
          return (right.supervisorScore ?? 0) - (left.supervisorScore ?? 0);
        return (right.submittedAt ?? "").localeCompare(left.submittedAt ?? "");
      });
  }, [query.data, search, sortBy, statusFilter]);
  const pageCount = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const pageRows = rows.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  if (query.isPending) return <LoadingState label={`Loading ${title.toLowerCase()}`} />;
  if (query.isError) return <ErrorState message={query.error.message} />;

  const detailPath = (row: PerformanceApprovalQueueRow) =>
    `${department ? "/department" : "/hr"}/review/${row.id}`;

  return (
    <div className="space-y-6">
      <PageHeader
        breadcrumbs={[department ? "Department Performance" : "Approval Center", title]}
        title={title}
        description={description}
      />
      {rows.length === 0 ? (
        <EmptyState
          title={`No ${title.toLowerCase()}`}
          description="Evaluations matching this workflow stage will appear here."
        />
      ) : (
        <div className="space-y-4 rounded-xl border border-border bg-card p-4">
          <div className="flex flex-col gap-3 sm:flex-row">
            <Input
              aria-label="Search evaluations"
              placeholder="Search employee, ID, department, supervisor, or period"
              value={search}
              onChange={(event) => {
                setSearch(event.currentTarget.value);
                setPage(0);
              }}
            />
            <select
              aria-label="Filter by status"
              className="h-10 rounded-md border border-input bg-background px-3 text-sm"
              value={statusFilter}
              onChange={(event) => {
                setStatusFilter(event.currentTarget.value);
                setPage(0);
              }}
            >
              <option value="ALL">All statuses</option>
              {[...new Set((query.data ?? []).map((row) => row.status))].map((status) => (
                <option key={status} value={status}>
                  {status.replaceAll("_", " ")}
                </option>
              ))}
            </select>
            <select
              aria-label="Sort evaluations"
              className="h-10 rounded-md border border-input bg-background px-3 text-sm"
              value={sortBy}
              onChange={(event) => {
                setSortBy(event.currentTarget.value);
                setPage(0);
              }}
            >
              <option value="recent">Newest submitted</option>
              <option value="employee">Employee name</option>
              <option value="employee-score">Employee score</option>
              <option value="supervisor-score">Supervisor score</option>
            </select>
          </div>
          {pageRows.length ? (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1050px] text-left text-sm">
                <thead className="border-b border-border text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="px-3 py-3">Evaluation / Employee</th>
                    <th className="px-3 py-3">Department / Position</th>
                    <th className="px-3 py-3">Supervisor</th>
                    {!department ? <th className="px-3 py-3">Department Head</th> : null}
                    <th className="px-3 py-3">Period</th>
                    <th className="px-3 py-3">Employee score</th>
                    <th className="px-3 py-3">Supervisor score</th>
                    <th className="px-3 py-3">
                      {department ? "Supervisor submitted" : "DH approved"}
                    </th>
                    <th className="px-3 py-3">Status</th>
                    <th className="px-3 py-3">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {pageRows.map((row) => (
                    <tr key={row.id} className="align-top">
                      <td className="px-3 py-3">
                        <div className="font-medium">{row.employeeName}</div>
                        <div className="text-xs text-muted-foreground">
                          {row.reference} · {row.employeeNumber}
                        </div>
                      </td>
                      <td className="px-3 py-3">
                        <div>{row.department}</div>
                        <div className="text-xs text-muted-foreground">{row.position}</div>
                      </td>
                      <td className="px-3 py-3">{row.supervisorName}</td>
                      {!department ? <td className="px-3 py-3">{row.departmentHeadName}</td> : null}
                      <td className="px-3 py-3">{row.periodName}</td>
                      <td className="px-3 py-3">{formatScore(row.employeeScore)}</td>
                      <td className="px-3 py-3">{formatScore(row.supervisorScore)}</td>
                      <td className="px-3 py-3">
                        {formatDate(department ? row.submittedAt : row.departmentHeadApprovedAt)}
                      </td>
                      <td className="px-3 py-3">
                        <StatusBadge>{row.status.replaceAll("_", " ")}</StatusBadge>
                      </td>
                      <td className="px-3 py-3">
                        <a
                          className="font-medium text-primary underline-offset-4 hover:underline"
                          href={detailPath(row)}
                        >
                          Review
                        </a>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="py-8 text-center text-sm text-muted-foreground">
              No evaluations match the current search and filters.
            </p>
          )}
          <div className="flex items-center justify-between border-t border-border pt-3 text-sm">
            <span className="text-muted-foreground">
              {rows.length} evaluation{rows.length === 1 ? "" : "s"}
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                className="rounded-md border border-border px-3 py-1.5 disabled:opacity-50"
                disabled={page === 0}
                onClick={() => setPage((current) => current - 1)}
              >
                Previous
              </button>
              <span>
                {page + 1} / {pageCount}
              </span>
              <button
                type="button"
                className="rounded-md border border-border px-3 py-1.5 disabled:opacity-50"
                disabled={page + 1 >= pageCount}
                onClick={() => setPage((current) => current + 1)}
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

function formatScore(score: number | null): string {
  return score === null ? "—" : `${Number(score).toFixed(2)} / 5.00`;
}

function formatDate(value: string | null): string {
  return value ? new Date(value).toLocaleDateString() : "—";
}
