import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { ArrowDown, ArrowUp, Download } from "lucide-react";

import { Badge } from "@/components/ui/badge";
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
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
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
  LoadingBlock,
  PageHeader,
  formatDateTime,
} from "@/components/shared/shared-ui";
import { listAuditEvents } from "@/lib/admin.functions";
import { humanizeToken } from "@/lib/domain";

export const Route = createFileRoute("/_authenticated/admin/audit-logs")({
  head: () => ({
    meta: [
      { title: "Audit logs | Priority Handling Logistics, Inc." },
      {
        name: "description",
        content: "Review important system activity by user, area, action, or date.",
      },
      { property: "og:title", content: "Audit logs" },
      { property: "og:description", content: "Immutable record of sensitive system actions." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AuditLogsPage,
});

const ALL = "__all__";
const PAGE_SIZE = 25;

type AuditRow = {
  id: string;
  occurred_at: string;
  actor_user_id: string | null;
  actor_role: string | null;
  action: string;
  module: string;
  entity_type: string | null;
  entity_id: string | null;
  employee_id: string | null;
  evaluation_id: string | null;
  evaluation_display_id: string | null;
  previous_value: unknown;
  new_value: unknown;
  reason: string | null;
  correlation_id: string | null;
  result: string;
};

function AuditLogsPage() {
  const fetchEvents = useServerFn(listAuditEvents);

  const [search, setSearch] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [actor, setActor] = useState(ALL);
  const [role, setRole] = useState("");
  const [module, setModule] = useState(ALL);
  const [action, setAction] = useState(ALL);
  const [entityType, setEntityType] = useState(ALL);
  const [result, setResult] = useState(ALL);
  const [evaluationId, setEvaluationId] = useState("");
  const [exporting, setExporting] = useState(false);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState<AuditRow | null>(null);

  const filters = {
    search,
    from,
    to,
    actor: actor === ALL ? "" : actor,
    role,
    module: module === ALL ? "" : module,
    action: action === ALL ? "" : action,
    entityType: entityType === ALL ? "" : entityType,
    result: result === ALL ? "" : result,
    evaluationId,
    page,
    pageSize: PAGE_SIZE,
    sortDir,
  };

  const query = useQuery({
    queryKey: ["audit-events", filters],
    queryFn: () => fetchEvents({ data: filters }),
    retry: false,
  });

  const rows = useMemo(() => {
    return (query.data?.rows ?? []) as AuditRow[];
  }, [query.data]);

  const options = useMemo(() => {
    const all = (query.data?.rows ?? []) as AuditRow[];
    const unique = (values: (string | null)[]) =>
      [...new Set(values.filter((value): value is string => Boolean(value)))].sort();
    return {
      modules: unique(all.map((row) => row.module)),
      actions: unique(all.map((row) => row.action)),
      entities: unique(all.map((row) => row.entity_type)),
      results: unique(all.map((row) => row.result)),
    };
  }, [query.data]);

  const actorName = (id: string | null) =>
    (query.data?.actors ?? []).find((a) => a.id === id)?.full_name ??
    (id ? "Unknown user" : "System");

  const pageCount = Math.max(1, Math.ceil((query.data?.totalCount ?? 0) / PAGE_SIZE));
  const current = Math.min(page, pageCount - 1);
  const visible = rows;

  async function exportCsv() {
    setExporting(true);
    try {
      const result = await fetchEvents({ data: { ...filters, page: 0, exportAll: true } });
      const escapeCsv = (value: unknown) => {
        const text = value == null ? "" : String(value);
        return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
      };
      const csv = [
        ["Evaluation ID", "Activity / Action", "Performed By", "Role", "Employee", "Date & Time", "Context", "Result"],
        ...result.rows.map((row) => [
          row.evaluation_display_id,
          row.action,
          actorName(row.actor_user_id),
          row.actor_role,
          (result.employees ?? []).find((employee) => employee.id === row.employee_id)?.full_name ?? row.employee_id,
          row.occurred_at,
          row.entity_type ? `${row.module}: ${row.entity_type}` : row.module,
          row.result,
        ]),
      ].map((row) => row.map(escapeCsv).join(",")).join("\r\n");
      const url = URL.createObjectURL(new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8" }));
      const link = document.createElement("a");
      link.href = url;
      link.download = "audit-log.csv";
      link.click();
      URL.revokeObjectURL(url);
    } finally {
      setExporting(false);
    }
  }

  if (query.isError) {
    const message = query.error instanceof Error ? query.error.message : "Unavailable";
    return <EmptyState title="You do not have access to audit logs" description={message} />;
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Activity Log"
        description="Review important system activity and investigate changes when needed."
        actions={
          <Button variant="outline" onClick={() => void exportCsv()} disabled={exporting || query.isLoading}>
            <Download />
            {exporting ? "Exporting..." : "Export CSV"}
          </Button>
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <div className="space-y-1.5">
          <Label htmlFor="audit-search">Search</Label>
          <Input
            id="audit-search"
            placeholder="Action, area, record or reason"
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              setPage(0);
            }}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="audit-from">From</Label>
          <Input
            id="audit-from"
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="audit-to">To</Label>
          <Input id="audit-to" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="audit-role">User role</Label>
          <Input
            id="audit-role"
            placeholder="e.g. ADMINISTRATOR"
            value={role}
            onChange={(e) => setRole(e.target.value)}
          />
        </div>
        <FilterSelect
          label="User"
          value={actor}
          onChange={setActor}
          allLabel="All users"
          options={(query.data?.actors ?? []).map((a) => ({ value: a.id, label: a.full_name }))}
        />
        <FilterSelect
          label="Area"
          value={module}
          onChange={setModule}
          allLabel="All areas"
          options={options.modules.map((value) => ({ value, label: value }))}
        />
        <FilterSelect
          label="Action"
          value={action}
          onChange={setAction}
          allLabel="All actions"
          options={options.actions.map((value) => ({ value, label: humanizeToken(value) }))}
        />
        <FilterSelect
          label="Record type"
          value={entityType}
          onChange={setEntityType}
          allLabel="All record types"
          options={options.entities.map((value) => ({ value, label: value }))}
        />
        <FilterSelect
          label="Result"
          value={result}
          onChange={setResult}
          allLabel="All results"
          options={options.results.map((value) => ({ value, label: value }))}
        />
        <div className="space-y-1.5">
          <Label htmlFor="audit-evaluation-id">Evaluation ID</Label>
          <Input
            id="audit-evaluation-id"
            placeholder="EV-2026-000001"
            value={evaluationId}
            onChange={(e) => {
              setEvaluationId(e.target.value);
              setPage(0);
            }}
          />
        </div>
      </div>

      {query.isLoading ? (
        <LoadingBlock rows={6} />
      ) : rows.length === 0 ? (
        <EmptyState
          title="No activity matches these filters"
          description="Try changing the filters above."
        />
      ) : (
        <>
          <div className="border border-border bg-card shadow-sm">
            <Table>
              <caption className="sr-only">Record of important actions</caption>
              <TableHeader>
                <TableRow>
                  <TableHead scope="col">
                    <button
                      type="button"
                      className="inline-flex items-center gap-1 font-medium"
                      onClick={() => setSortDir((prev) => (prev === "asc" ? "desc" : "asc"))}
                    >
                      When
                      {sortDir === "asc" ? (
                        <ArrowUp className="size-3" />
                      ) : (
                        <ArrowDown className="size-3" />
                      )}
                    </button>
                  </TableHead>
                  <TableHead scope="col">User</TableHead>
                  <TableHead scope="col">Evaluation ID</TableHead>
                  <TableHead scope="col">Action</TableHead>
                  <TableHead scope="col">Area</TableHead>
                  <TableHead scope="col">Result</TableHead>
                  <TableHead scope="col" className="text-right">
                    Detail
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {visible.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell className="text-xs whitespace-nowrap text-muted-foreground">
                      {formatDateTime(row.occurred_at)}
                    </TableCell>
                    <TableCell className="text-sm">
                      {actorName(row.actor_user_id)}
                      {row.actor_role ? (
                        <span className="block text-xs text-muted-foreground">
                          {row.actor_role}
                        </span>
                      ) : null}
                    </TableCell>
                    <TableCell className="font-mono text-xs">
                      {row.evaluation_display_id ?? "-"}
                    </TableCell>
                    <TableCell className="text-xs font-semibold">
                      {humanizeToken(row.action)}
                    </TableCell>
                    <TableCell className="text-sm">{row.module}</TableCell>
                    <TableCell>
                      <Badge variant={row.result === "SUCCESS" ? "secondary" : "destructive"}>
                        {row.result}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button variant="outline" size="sm" onClick={() => setSelected(row)}>
                        View
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs text-muted-foreground">
              Showing {query.data?.totalCount ? current * PAGE_SIZE + 1 : 0}-
              {Math.min(query.data?.totalCount ?? 0, (current + 1) * PAGE_SIZE)} of{" "}
              {query.data?.totalCount ?? 0}
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

      <Sheet open={selected !== null} onOpenChange={(open) => !open && setSelected(null)}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
          <SheetHeader>
            <SheetTitle>{humanizeToken(selected?.action)}</SheetTitle>
            <SheetDescription>{formatDateTime(selected?.occurred_at)}</SheetDescription>
          </SheetHeader>
          <div className="space-y-3 px-4 pb-10 text-sm">
            <Detail label="User" value={actorName(selected?.actor_user_id ?? null)} />
            <Detail label="User role" value={selected?.actor_role ?? "-"} />
            <Detail label="Area" value={selected?.module ?? "-"} />
            <Detail label="Record type" value={selected?.entity_type ?? "-"} />
            <Detail label="Record ID" value={selected?.entity_id ?? "-"} />
            <Detail label="Employee ID" value={selected?.employee_id ?? "-"} />
            <Detail label="Evaluation ID" value={selected?.evaluation_display_id ?? "-"} />
            <Detail label="Reference ID" value={selected?.correlation_id ?? "-"} />
            <Detail label="Result" value={selected?.result ?? "-"} />
            <Detail label="Reason" value={selected?.reason ?? "-"} />
            <div>
              <p className="text-xs uppercase tracking-wide text-muted-foreground">
                Previous value
              </p>
              <pre className="mt-1 overflow-x-auto rounded-md bg-muted p-2 text-xs">
                {JSON.stringify(selected?.previous_value ?? null, null, 2)}
              </pre>
            </div>
            <div>
              <p className="text-xs uppercase tracking-wide text-muted-foreground">New value</p>
              <pre className="mt-1 overflow-x-auto rounded-md bg-muted p-2 text-xs">
                {JSON.stringify(selected?.new_value ?? null, null, 2)}
              </pre>
            </div>
            <p className="text-xs text-muted-foreground">
              Sensitive values such as passwords and tokens are redacted before storage.
            </p>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3">
      <span className="text-xs uppercase tracking-wide text-muted-foreground">{label}</span>
      <span className="text-right break-all">{value}</span>
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
