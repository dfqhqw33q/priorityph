import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { ArrowDown, ArrowUp } from "lucide-react";

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
import { EmptyState, EvaluationStatusBadge, LoadingBlock, formatDateTime } from "@/components/ui-bits";
import { listQueueFilterOptions } from "@/lib/evaluations.functions";
import { EVALUATION_STATUS_LABELS, type EvaluationListItem, type EvaluationStatus } from "@/lib/domain";

const ALL = "__all__";
const PAGE_SIZE = 20;

type SortKey = "full_name_snapshot" | "employee_number_snapshot" | "employee_submitted_at" | "status";

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
    };
  }) => Promise<EvaluationListItem[]>;
  statuses: EvaluationStatus[];
  detailPath: "/supervisor/evaluations/$evaluationId" | "/president/evaluations/$evaluationId";
  emptyTitle: string;
}) {
  const fetchOptions = useServerFn(listQueueFilterOptions);
  const [search, setSearch] = useState("");
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
    search,
    year: year === ALL ? null : Number(year),
    division: division === ALL ? "" : division,
    section: section === ALL ? "" : section,
    status: status === ALL ? null : (status as EvaluationStatus),
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

  const rows = useMemo(() => {
    const list = [...(query.data ?? [])];
    list.sort((a, b) => {
      const left = String(a[sort.key] ?? "");
      const right = String(b[sort.key] ?? "");
      return sort.dir === "asc" ? left.localeCompare(right) : right.localeCompare(left);
    });
    return list;
  }, [query.data, sort]);

  const pageCount = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const current = Math.min(page, pageCount - 1);
  const visible = rows.slice(current * PAGE_SIZE, current * PAGE_SIZE + PAGE_SIZE);

  function toggleSort(key: SortKey) {
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
        title={message.includes("authorized") ? "You do not have access to this list" : "This list could not be loaded"}
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
            placeholder="Employee number or name"
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
          options={(optionsQuery.data?.years ?? []).map((y) => ({ value: String(y), label: String(y) }))}
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
          options={statuses.map((s) => ({ value: s, label: EVALUATION_STATUS_LABELS[s] }))}
          allLabel="All statuses"
        />
      </div>

      {query.isLoading ? (
        <LoadingBlock rows={5} />
      ) : rows.length === 0 ? (
        <EmptyState title={emptyTitle} description="Try changing the filters, or check back later." />
      ) : (
        <>
          <div className="overflow-x-auto rounded-xl border border-border bg-card shadow-sm">
            <Table>
              <caption className="sr-only">Employee evaluations available for review</caption>
              <TableHeader>
                <TableRow>
                  <TableHead scope="col">
                    <SortButton label="Employee" sortKey="full_name_snapshot" />
                  </TableHead>
                  <TableHead scope="col">
                    <SortButton label="Employee no." sortKey="employee_number_snapshot" />
                  </TableHead>
                  <TableHead scope="col">Job title</TableHead>
                  <TableHead scope="col">Division / section</TableHead>
                  <TableHead scope="col">Cycle</TableHead>
                  <TableHead scope="col">
                    <SortButton label="Self-assessment submitted" sortKey="employee_submitted_at" />
                  </TableHead>
                  <TableHead scope="col">Supervisor review submitted</TableHead>
                  <TableHead scope="col">
                    <SortButton label="Status" sortKey="status" />
                  </TableHead>
                  <TableHead scope="col" className="text-right">
                    Action
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {visible.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell className="font-medium">{row.full_name_snapshot}</TableCell>
                    <TableCell className="tabular-nums">{row.employee_number_snapshot}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{row.job_title_snapshot}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {row.division_snapshot}
                      {row.section_snapshot ? ` · ${row.section_snapshot}` : ""}
                    </TableCell>
                    <TableCell className="text-sm">
                      {row.cycle_name} ({row.cycle_year})
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {formatDateTime(row.employee_submitted_at)}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {formatDateTime(row.supervisor_submitted_at)}
                    </TableCell>
                    <TableCell>
                      <EvaluationStatusBadge status={row.status} />
                    </TableCell>
                    <TableCell className="text-right">
                      <Button variant="outline" size="sm" asChild>
                        <Link to={detailPath} params={{ evaluationId: row.id }}>
                          Open
                        </Link>
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs text-muted-foreground">
              Showing {current * PAGE_SIZE + 1}–{Math.min(rows.length, (current + 1) * PAGE_SIZE)} of{" "}
              {rows.length}
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
