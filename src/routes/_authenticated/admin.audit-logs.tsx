import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { ArrowDown, ArrowUp } from "lucide-react";

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
import { EmptyState, LoadingBlock, PageHeader, formatDateTime } from "@/components/ui-bits";
import { listAuditEvents } from "@/lib/admin.functions";
import { humanizeToken } from "@/lib/domain";


export const Route = createFileRoute("/_authenticated/admin/audit-logs")({
  head: () => ({
    meta: [
      { title: "Audit logs | Priority Handling Logistics, Inc." },
      {
        name: "description",
        content: "Read-only audit trail of every sensitive action, filterable by actor, module, action and date.",
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
    limit: 500,
  };

  const query = useQuery({
    queryKey: ["audit-events", filters],
    queryFn: () => fetchEvents({ data: filters }),
    retry: false,
  });

  const rows = useMemo(() => {
    const list = [...((query.data?.rows ?? []) as AuditRow[])];
    list.sort((a, b) =>
      sortDir === "asc"
        ? a.occurred_at.localeCompare(b.occurred_at)
        : b.occurred_at.localeCompare(a.occurred_at),
    );
    return list;
  }, [query.data, sortDir]);

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
    (query.data?.actors ?? []).find((a) => a.id === id)?.full_name ?? (id ? "Unknown user" : "System");

  const pageCount = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const current = Math.min(page, pageCount - 1);
  const visible = rows.slice(current * PAGE_SIZE, current * PAGE_SIZE + PAGE_SIZE);

  if (query.isError) {
    const message = query.error instanceof Error ? query.error.message : "Unavailable";
    return <EmptyState title="You do not have access to audit logs" description={message} />;
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Audit logs"
        description="A permanent record of important actions. Entries cannot be edited or deleted."
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
          <Input id="audit-from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
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
      </div>

      {query.isLoading ? (
        <LoadingBlock rows={6} />
      ) : rows.length === 0 ? (
        <EmptyState title="No activity matches these filters" description="Try changing the filters above." />
      ) : (
        <>
          <div className="overflow-x-auto rounded-xl border border-border bg-card shadow-sm">
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
                      {sortDir === "asc" ? <ArrowUp className="size-3" /> : <ArrowDown className="size-3" />}
                    </button>
                  </TableHead>
                  <TableHead scope="col">User</TableHead>
                  <TableHead scope="col">Action</TableHead>
                  <TableHead scope="col">Area</TableHead>
                  <TableHead scope="col">Record</TableHead>
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
                        <span className="block text-xs text-muted-foreground">{row.actor_role}</span>
                      ) : null}
                    </TableCell>
                    <TableCell className="text-xs font-semibold">{humanizeToken(row.action)}</TableCell>
                    <TableCell className="text-sm">{row.module}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {row.entity_type ?? "—"}
                    </TableCell>
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

      <Sheet open={selected !== null} onOpenChange={(open) => !open && setSelected(null)}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
          <SheetHeader>
            <SheetTitle>{humanizeToken(selected?.action)}</SheetTitle>
            <SheetDescription>{formatDateTime(selected?.occurred_at)}</SheetDescription>
          </SheetHeader>
          <div className="space-y-3 px-4 pb-10 text-sm">
            <Detail label="User" value={actorName(selected?.actor_user_id ?? null)} />
            <Detail label="User role" value={selected?.actor_role ?? "—"} />
            <Detail label="Area" value={selected?.module ?? "—"} />
            <Detail label="Record type" value={selected?.entity_type ?? "—"} />
            <Detail label="Record ID" value={selected?.entity_id ?? "—"} />
            <Detail label="Employee ID" value={selected?.employee_id ?? "—"} />
            <Detail label="Evaluation ID" value={selected?.evaluation_id ?? "—"} />
            <Detail label="Reference ID" value={selected?.correlation_id ?? "—"} />
            <Detail label="Result" value={selected?.result ?? "—"} />
            <Detail label="Reason" value={selected?.reason ?? "—"} />
            <div>
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Previous value</p>
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
