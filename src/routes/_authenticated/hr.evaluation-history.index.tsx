import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import {
  EmptyState,
  EvaluationStatusBadge,
  LoadingBlock,
  PageHeader,
  StatCard,
  formatDateTime,
} from "@/components/ui-bits";
import { getReport, type ReportRow } from "@/lib/reports.functions";
import { EVALUATION_STATUS_LABELS, EVALUATION_STATUSES } from "@/lib/domain";

const ALL = "";
const PAGE_SIZE = 25;

export const Route = createFileRoute("/_authenticated/hr/evaluation-history/")({
  head: () => ({
    meta: [
      { title: "Evaluation history | Priority Handling Logistics, Inc." },
      {
        name: "description",
        content: "Search permanent evaluation records, outcomes and workflow progress in one place.",
      },
      { property: "og:title", content: "Evaluation history" },
      { property: "og:description", content: "Read-only evaluation records with reporting summaries." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: HistoryPage,
});

function HistoryPage() {
  const fetchReport = useServerFn(getReport);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState(ALL);
  const [page, setPage] = useState(0);

  const query = useQuery({
    queryKey: ["evaluation-history", { search, status, page }],
    queryFn: () => fetchReport({ data: { search, status, page, pageSize: PAGE_SIZE } }),
    retry: false,
  });
  const rows = (query.data?.rows ?? []) as ReportRow[];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Evaluation history"
        description="Completed evaluation records and summary figures."
      />

      {query.data ? (
        <div className="grid gap-4 sm:grid-cols-3">
          <StatCard label="Total evaluations" value={query.data.totalCount} />
          <StatCard label="Scored evaluations" value={query.data.summary.scored} />
          <StatCard label="Average final score" value={query.data.summary.averageFinalScore?.toFixed(2) ?? "—"} />
        </div>
      ) : null}

      <Card className="border border-border bg-card shadow-sm">
        <CardContent className="grid gap-4 pt-6 sm:grid-cols-[1fr_220px_auto] sm:items-end">
          <div className="space-y-1.5">
            <Label htmlFor="history-search">Employee number or name</Label>
            <Input
              id="history-search"
              placeholder="Search employees..."
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(0);
              }}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="history-status">Status</Label>
            <select
              id="history-status"
              className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              value={status}
              onChange={(e) => {
                setStatus(e.target.value);
                setPage(0);
              }}
            >
              <option value={ALL}>All statuses</option>
              {EVALUATION_STATUSES.map((value) => (
                <option key={value} value={value}>
                  {EVALUATION_STATUS_LABELS[value]}
                </option>
              ))}
            </select>
          </div>
          <Button
            variant="outline"
            onClick={() => {
              setSearch("");
              setStatus(ALL);
              setPage(0);
            }}
          >
            Clear filters
          </Button>
        </CardContent>
      </Card>

      {query.isLoading ? (
        <LoadingBlock rows={6} />
      ) : query.isError ? (
        <EmptyState title="Evaluation history could not be loaded" description={(query.error as Error).message} />
      ) : rows.length === 0 ? (
        <EmptyState title="No evaluation history" description="Evaluations appear here once they are completed." />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border bg-card shadow-sm">
          <table className="w-full text-left text-sm">
            <caption className="sr-only">Evaluation history</caption>
            <thead className="border-b border-border bg-muted/60">
              <tr>
                {["Employee", "Cycle", "Status", "Employee average", "Supervisor average", "Final score", "Finalized"].map(
                  (heading) => (
                    <th key={heading} className="px-4 py-3.5 font-semibold text-foreground">
                      {heading}
                    </th>
                  ),
                )}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr
                  key={row.evaluationId}
                  className="border-b border-border transition-colors last:border-0 hover:bg-muted/30"
                >
                  <td className="px-4 py-3.5">
                    <Link
                      className="font-semibold text-foreground hover:text-primary hover:underline"
                      to="/hr/evaluation-history/$evaluationId"
                      params={{ evaluationId: row.evaluationId }}
                    >
                      {row.fullName}
                    </Link>
                    <div className="text-xs text-muted-foreground">{row.employeeNumber}</div>
                  </td>
                  <td className="px-4 py-3.5 text-foreground">
                    {row.cycleName} ({row.cycleYear})
                  </td>
                  <td className="px-4 py-3.5">
                    <EvaluationStatusBadge status={row.status as never} />
                  </td>
                  <td className="px-4 py-3.5 tabular-nums text-foreground">{row.employeeAverage?.toFixed(2) ?? "—"}</td>
                  <td className="px-4 py-3.5 tabular-nums text-foreground">
                    {row.supervisorAverage?.toFixed(2) ?? "—"}
                  </td>
                  <td className="px-4 py-3.5 font-semibold tabular-nums text-primary">
                    {row.finalScore?.toFixed(2) ?? "—"} {row.finalRating ?? ""}
                  </td>
                  <td className="px-4 py-3.5 text-xs text-muted-foreground">{formatDateTime(row.finalizedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {query.data && query.data.totalCount > PAGE_SIZE ? (
        <div className="flex gap-2">
          <Button variant="outline" disabled={page === 0} onClick={() => setPage((value) => value - 1)}>
            Previous
          </Button>
          <Button
            variant="outline"
            disabled={(page + 1) * PAGE_SIZE >= query.data.totalCount}
            onClick={() => setPage((value) => value + 1)}
          >
            Next
          </Button>
        </div>
      ) : null}
    </div>
  );
}
