import { createFileRoute, Link, Outlet, useLocation } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, ArrowRight, History as HistoryIcon, RotateCcw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
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
  EvaluationStatusBadge,
  LoadingBlock,
  PageHeader,
  StatCard,
  formatDateTime,
} from "@/components/shared/shared-ui";
import { getEvaluationHistory, getReport, type ReportRow } from "@/lib/reports.functions";
import { EVALUATION_STATUS_LABELS, EVALUATION_STATUSES } from "@/lib/domain";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { useAccess } from "@/hooks/use-access";
import { getEvaluationSheetHtml } from "@/lib/documents.functions";
import { EvaluationDocumentPreview } from "@/features/performance-management/components/evaluation-document-preview";
import { EvaluationProgressStepper } from "@/features/performance-management/components/evaluation-progress-stepper";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const ALL = "";
const PAGE_SIZE = 25;
const CURRENT_YEAR = new Date().getFullYear();

type HistoryPageProps = {
  title: string;
  description: string;
  defaultStatus?: string;
  mode?: "history" | "completed" | "drafts" | "returned";
  showStatusFilter?: boolean;
};

export function HistoryTablePage({
  title,
  description,
  defaultStatus = ALL,
  mode = "history",
  showStatusFilter = mode === "history",
}: HistoryPageProps) {
  const fetchReport = useServerFn(getReport);
  const fetchSheetHtml = useServerFn(getEvaluationSheetHtml);
  const fetchEvaluationHistory = useServerFn(getEvaluationHistory);
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedValue(search);
  const [status, setStatus] = useState(defaultStatus);
  const [cycleId, setCycleId] = useState<string>(ALL);
  const [page, setPage] = useState(0);
  const [previewEvaluationId, setPreviewEvaluationId] = useState<string | null>(null);
  const [previewHtml, setPreviewHtml] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [timelineEvaluationId, setTimelineEvaluationId] = useState<string | null>(null);

  const effectiveStatus =
    mode === "completed"
      ? defaultStatus || "FOR_REVIEW"
      : mode === "drafts"
        ? "DRAFT"
        : mode === "returned"
          ? "RETURNED"
          : status || defaultStatus;

  const query = useQuery({
    queryKey: [
      "evaluation-history",
      { mode, search: debouncedSearch, status: effectiveStatus, cycleId: cycleId ?? ALL, page },
    ],
    queryFn: () =>
      fetchReport({
        data: {
          search: debouncedSearch,
          status: effectiveStatus,
          cycleId: (cycleId ?? ALL) === ALL ? null : (cycleId ?? null),
          year: null,
          recordType: mode,
          page,
          pageSize: PAGE_SIZE,
        },
      }),
    retry: false,
  });
  const timelineQuery = useQuery({
    queryKey: ["evaluation-history-timeline", timelineEvaluationId],
    queryFn: () => fetchEvaluationHistory({ data: { evaluationId: timelineEvaluationId! } }),
    enabled: timelineEvaluationId !== null,
    retry: false,
  });

  const rows = (query.data?.rows ?? []) as ReportRow[];
  const effectiveCycleId = cycleId ?? ALL;
  const cycleOptions = (query.data?.options.cycles ?? []).filter((cycle) => cycle.id && cycle.year);
  const currentRole = (useAccess()?.access?.roles ?? []) as Array<
    "HR" | "SUPERVISOR" | "REVIEWING_SUPERVISOR" | "COMMITTEE" | "PRESIDENT"
  >;
  const rolePrefix = currentRole.includes("SUPERVISOR")
    ? "/supervisor"
    : currentRole.includes("REVIEWING_SUPERVISOR")
      ? "/reviewing-supervisor"
      : currentRole.includes("COMMITTEE")
        ? "/committee"
        : currentRole.includes("PRESIDENT")
          ? "/president"
          : "/hr";
  const detailRoute =
    mode === "history"
      ? "/hr/evaluation-history/$evaluationId"
      : `${rolePrefix}/${mode}/$evaluationId`;

  async function openEvaluationPreview(evaluationId: string) {
    setPreviewEvaluationId(evaluationId);
    setPreviewHtml(null);
    setPreviewLoading(true);
    try {
      const result = await fetchSheetHtml({ data: { evaluationId } });
      setPreviewHtml(result.html);
    } catch (error) {
      setPreviewEvaluationId(null);
      window.alert(
        error instanceof Error ? error.message : "The evaluation document is not available yet.",
      );
    } finally {
      setPreviewLoading(false);
    }
  }
  const selectedCycle = useMemo(
    () => cycleOptions.find((cycle) => cycle.id === effectiveCycleId) ?? null,
    [effectiveCycleId, cycleOptions],
  );
  const hasActiveFilters =
    search.trim().length > 0 ||
    (showStatusFilter && status !== defaultStatus) ||
    effectiveCycleId !== ALL;

  const emptyTitle =
    search.trim() || (showStatusFilter && status !== defaultStatus) || effectiveCycleId !== ALL
      ? "No evaluation records found"
      : "No evaluation records found";
  const emptyDescription =
    effectiveCycleId !== ALL
      ? "There are no evaluations for the selected evaluation cycle."
      : search.trim() || (showStatusFilter && status !== defaultStatus)
        ? "There are no evaluations matching your current filters."
        : "There are no evaluations for the selected evaluation cycle.";

  return (
    <div className="space-y-6">
      <PageHeader title={title} description={description} />

      {mode === "history" && query.data ? (
        <div className="grid gap-4 sm:grid-cols-2">
          <StatCard label="Total evaluations" value={query.data.totalCount} />
          <StatCard
            label="Current cycle"
            value={selectedCycle ? `${selectedCycle.name} (${selectedCycle.year})` : "All cycles"}
          />
        </div>
      ) : null}

      <Card className="border border-border bg-card shadow-sm">
        <CardContent
          className={`grid gap-4 pt-6 md:items-end ${
            mode === "completed"
              ? "md:grid-cols-[1.2fr_1.2fr_auto]"
              : "md:grid-cols-[1.2fr_1fr_1.2fr_auto]"
          }`}
        >
          <div className="space-y-1.5">
            <Label htmlFor="history-search">Employee ID or name</Label>
            <Input
              id="history-search"
              placeholder={
                mode === "completed" ? "Search employee ID or name" : "Search employees..."
              }
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(0);
              }}
            />
          </div>
          {showStatusFilter ? (
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
          ) : null}
          <div className="space-y-1.5">
            <Label htmlFor="history-cycle">
              {mode === "completed" ? "Evaluation Cycle" : "Evaluation Cycle / Year"}
            </Label>
            <select
              id="history-cycle"
              className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              value={effectiveCycleId}
              onChange={(e) => {
                setCycleId(e.target.value);
                setPage(0);
              }}
            >
              <option value={ALL}>
                {mode === "completed" ? "All cycles" : "All evaluation cycles"}
              </option>
              {cycleOptions.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.name ? `${option.name} (${option.year})` : `${option.year}`}
                </option>
              ))}
            </select>
          </div>
          <Button
            variant="outline"
            onClick={() => {
              setSearch("");
              setStatus(defaultStatus);
              setCycleId(ALL);
              setPage(0);
            }}
          >
            <RotateCcw />
            Clear filters
          </Button>
        </CardContent>
      </Card>

      {query.isLoading ? (
        <LoadingBlock rows={6} />
      ) : query.isError ? (
        <EmptyState
          title={title + " could not be loaded"}
          description={(query.error as Error).message}
        />
      ) : rows.length === 0 ? (
        <EmptyState title={emptyTitle} description={emptyDescription}>
          {hasActiveFilters ? (
            <Button
              className="mt-4"
              variant="outline"
              onClick={() => {
                setSearch("");
                setStatus(defaultStatus);
                setCycleId(ALL);
                setPage(0);
              }}
            >
              Clear filters
            </Button>
          ) : null}
        </EmptyState>
      ) : (
        <div className="max-w-full border border-border bg-card shadow-sm">
          <Table>
            <caption className="sr-only">{title}</caption>
            <TableHeader>
              <TableRow>
                <TableHead className="min-w-[120px] whitespace-nowrap">Employee ID</TableHead>
                <TableHead className="min-w-[190px]">Full Name</TableHead>
                <TableHead className="min-w-[150px]">Job Title</TableHead>
                <TableHead className="min-w-[170px]">Division / Department</TableHead>
                <TableHead className="min-w-[150px]">Section / Unit</TableHead>
                <TableHead className="min-w-[240px]">Cycle</TableHead>
                <TableHead className="min-w-[120px] whitespace-nowrap">Status</TableHead>
                <TableHead className="min-w-[190px] whitespace-nowrap">Date Submitted</TableHead>
                {mode === "history" ? (
                  <TableHead className="w-[60px] text-right">Activity</TableHead>
                ) : null}
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => {
                const visibleStatus =
                  mode === "completed"
                    ? row.status === "FINALIZED"
                      ? "FINALIZED"
                      : "SUBMITTED"
                    : mode === "drafts"
                      ? "DRAFT"
                      : mode === "returned"
                        ? "RETURNED"
                        : row.status;
                return (
                  <TableRow key={row.evaluationId}>
                    <TableCell className="whitespace-nowrap tabular-nums">
                      {row.employeeNumber}
                    </TableCell>
                    <TableCell>
                      {mode === "history" ? (
                        <button
                          type="button"
                          aria-label={`Preview ${row.fullName}'s evaluation document`}
                          className="font-normal text-foreground transition-colors hover:text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                          onClick={() => openEvaluationPreview(row.evaluationId)}
                        >
                          {row.fullName}
                        </button>
                      ) : (
                        <Link
                          className="font-normal text-foreground transition-colors hover:text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                          to={detailRoute as never}
                          params={{ evaluationId: row.evaluationId } as never}
                        >
                          {row.fullName}
                        </Link>
                      )}
                    </TableCell>
                    <TableCell className="min-w-[150px] text-muted-foreground">
                      {row.jobTitle || "—"}
                    </TableCell>
                    <TableCell className="min-w-[170px] text-muted-foreground">
                      {row.division || "—"}
                    </TableCell>
                    <TableCell className="min-w-[150px] text-muted-foreground">
                      {row.section || "—"}
                    </TableCell>
                    <TableCell className="min-w-[240px] text-foreground">
                      {row.cycleName} ({row.cycleYear})
                    </TableCell>
                    <TableCell className="whitespace-nowrap">
                      <EvaluationStatusBadge status={visibleStatus as never} />
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                      {formatDateTime(row.submittedAt ?? row.finalizedAt)}
                    </TableCell>
                    {mode === "history" ? (
                      <TableCell className="text-right">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          title="View evaluation activity"
                          aria-label={`View activity for ${row.fullName}`}
                          onClick={() => setTimelineEvaluationId(row.evaluationId)}
                        >
                          <HistoryIcon />
                        </Button>
                      </TableCell>
                    ) : null}
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      {query.data && query.data.totalCount > PAGE_SIZE ? (
        <div className="flex gap-2">
          <Button
            variant="outline"
            disabled={page === 0}
            onClick={() => setPage((value) => value - 1)}
          >
            <ArrowLeft />
            Previous
          </Button>
          <Button
            variant="outline"
            disabled={(page + 1) * PAGE_SIZE >= query.data.totalCount}
            onClick={() => setPage((value) => value + 1)}
          >
            <ArrowRight />
            Next
          </Button>
        </div>
      ) : null}

      <EvaluationDocumentPreview
        html={previewHtml}
        open={previewEvaluationId !== null}
        loading={previewLoading}
        onOpenChange={(open) => {
          if (!open) {
            setPreviewEvaluationId(null);
            setPreviewHtml(null);
          }
        }}
      />

      <Dialog
        open={timelineEvaluationId !== null}
        onOpenChange={(open) => {
          if (!open) setTimelineEvaluationId(null);
        }}
      >
        <DialogContent className="flex h-[82vh] max-w-xl flex-col gap-3 p-4 sm:p-6">
          <DialogHeader>
            <DialogTitle>Evaluation Activity</DialogTitle>
            <DialogDescription>Complete workflow history for this evaluation.</DialogDescription>
          </DialogHeader>
          <div className="min-h-0 flex-1">
            {timelineQuery.isLoading ? (
              <LoadingBlock rows={6} variant="detail" />
            ) : timelineQuery.isError || !timelineQuery.data?.detail ? (
              <EmptyState
                title="Activity could not be loaded"
                description={
                  timelineQuery.error instanceof Error
                    ? timelineQuery.error.message
                    : "Evaluation history is unavailable."
                }
              />
            ) : (
              <EvaluationProgressStepper
                events={timelineQuery.data.events}
                currentStatus={timelineQuery.data.detail.status}
                employeeName={timelineQuery.data.detail.full_name_snapshot}
              />
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export const Route = createFileRoute("/_authenticated/hr/evaluation-history/")({
  head: () => ({
    meta: [
      { title: "Evaluation history | Priority Handling Logistics, Inc." },
      {
        name: "description",
        content:
          "Search permanent evaluation records, outcomes and workflow progress in one place.",
      },
      { property: "og:title", content: "Evaluation history" },
      {
        property: "og:description",
        content: "Completed evaluations, scores, and performance trends.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: function EvaluationHistoryRoute() {
    const location = useLocation();
    const isDetailRoute =
      location.pathname !== "/hr/evaluation-history" &&
      location.pathname.startsWith("/hr/evaluation-history/");

    if (isDetailRoute) {
      return <Outlet />;
    }

    return (
      <HistoryTablePage
        title="Evaluation History"
        description="Review finalized evaluation records across evaluation cycles."
        defaultStatus="FINALIZED"
        mode="history"
      />
    );
  },
});
