import { Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { ArrowDown, ArrowUp } from "lucide-react";
import { useDebouncedValue } from "@/hooks/use-debounced-value";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
  formatDateTime,
} from "@/components/shared/shared-ui";
import { listQueueFilterOptions } from "@/lib/evaluations.functions";
import {
  EVALUATION_STATUS_LABELS,
  getSupervisorDisplayStatus,
  type EvaluationListItem,
  type EvaluationStatus,
} from "@/lib/domain";

const ALL = "__all__";
const PAGE_SIZE = 20;

type SortKey =
  "full_name_snapshot" | "employee_number_snapshot" | "employee_submitted_at" | "status";

export function EvaluationQueue({
  queryKey,
  fetcher,
  statuses,
  detailPath,
  emptyTitle,
}: {
  queryKey: string;
  fetcher: (args: {
    data: {
      search: string;
      year: number | null;
      division: string;
      section: string;
      status: EvaluationStatus | null;
      page: number;
      pageSize: number;
      sort: SortKey;
      sortDir: "asc" | "desc";
    };
  }) => Promise<{ rows: EvaluationListItem[]; total: number }>;
  statuses: EvaluationStatus[];
  detailPath: "/supervisor/evaluations/$evaluationId" | "/president/evaluations/$evaluationId";
  emptyTitle: string;
}) {
  const fetchOptions = useServerFn(listQueueFilterOptions);
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedValue(search);
  const [year, setYear] = useState<string>(ALL);
  const [division, setDivision] = useState<string>(ALL);
  const [section, setSection] = useState<string>(ALL);
  const [status, setStatus] = useState<string>(ALL);
  const [sort, setSort] = useState<{ key: SortKey; dir: "asc" | "desc" }>({
    key: "employee_submitted_at",
    dir: "desc",
  });
  const [page, setPage] = useState(0);

  const filters = {
    search: debouncedSearch,
    year: year === ALL ? null : Number(year),
    division: division === ALL ? "" : division,
    section: section === ALL ? "" : section,
    status: status === ALL ? null : (status as EvaluationStatus),
    page,
    pageSize: PAGE_SIZE,
    sort: sort.key,
    sortDir: sort.dir,
  };

  const optionsQuery = useQuery({
    queryKey: ["queue-filter-options"],
    queryFn: () => fetchOptions(),
    staleTime: 60_000,
  });

  const query = useQuery({
    queryKey: [queryKey, filters],
    queryFn: () => fetcher({ data: filters }),
    retry: false,
  });

  const rows = query.data?.rows ?? [];
  const total = query.data?.total ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const current = Math.min(page, pageCount - 1);
  const visible = rows;

  function toggleSort(key: SortKey) {
    setPage(0);
    setSort((prev) => ({ key, dir: prev.key === key && prev.dir === "asc" ? "desc" : "asc" }));
  }

  function SortButton({ label, sortKey }: { label: string; sortKey: SortKey }) {
    const active = sort.key === sortKey;
    return (
      <button
        type="button"
        onClick={() => toggleSort(sortKey)}
        className="inline-flex items-center gap-1 font-medium"
        aria-label={`Sort by ${label}`}
      >
        {label}
        {active ? (
          sort.dir === "asc" ? (
            <ArrowUp className="size-3" />
          ) : (
            <ArrowDown className="size-3" />
          )
        ) : null}
      </button>
    );
  }

  if (query.isError) {
    const message = query.error instanceof Error ? query.error.message : "Something went wrong";
    return (
      <EmptyState
        title={
          message.includes("authorized")
            ? "You do not have access to this list"
            : "This list could not be loaded"
        }
        description={message}
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <div className="space-y-1.5">
          <Label htmlFor="queue-search">Search</Label>
          <Input
            id="queue-search"
            placeholder="Employee ID or name"
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              setPage(0);
            }}
          />
        </div>
        <FilterSelect
          label="Cycle year"
          value={year}
          onChange={(value) => {
            setYear(value);
            setPage(0);
          }}
          options={(optionsQuery.data?.years ?? []).map((y) => ({
            value: String(y),
            label: String(y),
          }))}
          allLabel="All years"
        />
        <FilterSelect
          label="Division / department"
          value={division}
          onChange={(value) => {
            setDivision(value);
            setPage(0);
          }}
          options={(optionsQuery.data?.divisions ?? []).map((v) => ({ value: v, label: v }))}
          allLabel="All divisions"
        />
        <FilterSelect
          label="Section / unit"
          value={section}
          onChange={(value) => {
            setSection(value);
            setPage(0);
          }}
          options={(optionsQuery.data?.sections ?? []).map((v) => ({ value: v, label: v }))}
          allLabel="All sections"
        />
        <FilterSelect
          label="Status"
          value={status}
          onChange={(value) => {
            setStatus(value);
            setPage(0);
          }}
          options={statuses.map((s) => ({
            value: s,
            label:
              queryKey === "supervisor-queue"
                ? EVALUATION_STATUS_LABELS[getSupervisorDisplayStatus(s)]
                : EVALUATION_STATUS_LABELS[s],
          }))}
          allLabel="All statuses"
        />
      </div>

      {query.isLoading ? (
        <LoadingBlock rows={5} />
      ) : rows.length === 0 ? (
        <EmptyState
          title={emptyTitle}
          description="Try changing the filters, or check back later."
        />
      ) : (
        <>
          <div className="border border-border bg-card shadow-sm">
            <Table>
              <caption className="sr-only">Employee evaluations available for review</caption>
              <TableHeader>
                <TableRow>
                  <TableHead scope="col" className="min-w-[120px] whitespace-nowrap">
                    <SortButton label="Employee ID" sortKey="employee_number_snapshot" />
                  </TableHead>
                  <TableHead scope="col" className="min-w-[190px]">
                    <SortButton label="Full Name" sortKey="full_name_snapshot" />
                  </TableHead>
                  <TableHead scope="col" className="min-w-[150px]">
                    Job Title
                  </TableHead>
                  <TableHead scope="col" className="min-w-[170px]">
                    Division / Department
                  </TableHead>
                  <TableHead scope="col" className="min-w-[150px]">
                    Section / Unit
                  </TableHead>
                  <TableHead scope="col" className="min-w-[240px]">
                    Cycle
                  </TableHead>
                  <TableHead scope="col" className="min-w-[190px] whitespace-nowrap">
                    <SortButton label="Date Submitted" sortKey="employee_submitted_at" />
                  </TableHead>
                  <TableHead scope="col" className="min-w-[120px] whitespace-nowrap">
                    <SortButton label="Status" sortKey="status" />
                  </TableHead>
                  <TableHead scope="col" className="text-right">
                    Action
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {visible.map((row) => {
                  const badgeStatus =
                    queryKey === "supervisor-queue"
                      ? getSupervisorDisplayStatus(row.status)
                      : row.status;

                  return (
                    <TableRow key={row.id}>
                      <TableCell className="whitespace-nowrap tabular-nums">
                        {row.employee_number_snapshot}
                      </TableCell>
                      <TableCell>
                        <button
                          type="button"
                          className="font-normal text-foreground transition-colors hover:text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                          onClick={() =>
                            navigate({ to: detailPath, params: { evaluationId: row.id } })
                          }
                        >
                          {row.full_name_snapshot}
                        </button>
                      </TableCell>
                      <TableCell className="min-w-[150px] text-muted-foreground">
                        {row.job_title_snapshot || "—"}
                      </TableCell>
                      <TableCell className="min-w-[170px] text-muted-foreground">
                        {row.division_snapshot || "—"}
                      </TableCell>
                      <TableCell className="min-w-[150px] text-muted-foreground">
                        {row.section_snapshot || "—"}
                      </TableCell>
                      <TableCell className="min-w-[240px] text-foreground">
                        {row.cycle_name} ({row.cycle_year})
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                        {formatDateTime(row.employee_submitted_at)}
                      </TableCell>
                      <TableCell className="whitespace-nowrap">
                        <EvaluationStatusBadge status={badgeStatus} />
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="outline"
                          size="sm"
                          type="button"
                          onClick={() =>
                            navigate({ to: detailPath, params: { evaluationId: row.id } })
                          }
                        >
                          Open
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs text-muted-foreground">
              Showing {total === 0 ? 0 : current * PAGE_SIZE + 1}-
              {Math.min(total, (current + 1) * PAGE_SIZE)} of {total}
            </p>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={current === 0}
                onClick={() => setPage((p) => Math.max(0, p - 1))}
              >
                Previous
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={current >= pageCount - 1}
                onClick={() => setPage((p) => p + 1)}
              >
                Next
              </Button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function FilterSelect({
  label,
  value,
  onChange,
  options,
  allLabel,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
  allLabel: string;
}) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger aria-label={label}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>{allLabel}</SelectItem>
          {options.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
