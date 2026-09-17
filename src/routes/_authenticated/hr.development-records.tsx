import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
import {
  listDevelopmentEmployees,
  listDevelopmentRecords,
  updateDevelopmentRecord,
  type DevelopmentRecord,
} from "@/features/learning-management/development.functions";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { humanizeToken } from "@/lib/domain";

const activities = [
  "Coaching",
  "Mentoring",
  "Self-Development",
  "External Learning",
  "External Training",
  "Not specified",
] as const;
const statuses = ["Recommended", "Ongoing", "Completed"] as const;
type FormState = {
  developmentNeed: string;
  developmentActivity: (typeof activities)[number];
  status: (typeof statuses)[number];
  recordDate: string;
  notes: string;
};

export const Route = createFileRoute("/_authenticated/hr/development-records")({
  component: DevelopmentRecordsPage,
});

function DevelopmentRecordsPage() {
  const queryClient = useQueryClient();
  const fetchRecords = useServerFn(listDevelopmentRecords);
  const fetchEmployees = useServerFn(listDevelopmentEmployees);
  const saveRecord = useServerFn(updateDevelopmentRecord);
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedValue(search);
  const [employeeId, setEmployeeId] = useState("");
  const [status, setStatus] = useState("");
  const [activity, setActivity] = useState("");
  const [editing, setEditing] = useState<DevelopmentRecord | null>(null);
  const recordsQuery = useQuery({
    queryKey: ["development-records", { search: debouncedSearch, employeeId, status, activity }],
    queryFn: () =>
      fetchRecords({
        data: {
          search: debouncedSearch,
          employeeId: employeeId || null,
          status: (status || null) as (typeof statuses)[number] | null,
          activity: (activity || null) as (typeof activities)[number] | null,
        },
      }),
    retry: false,
  });
  const employeesQuery = useQuery({
    queryKey: ["development-record-employees"],
    queryFn: () => fetchEmployees(),
    retry: false,
  });
  const mutation = useMutation({
    mutationFn: (form: FormState & { id: string }) => saveRecord({ data: form }),
    onSuccess: async () => {
      setEditing(null);
      await queryClient.invalidateQueries({ queryKey: ["development-records"] });
    },
  });
  const records = recordsQuery.data ?? [];
  const recordsByEmployee = Array.from(
    records.reduce((groups, record) => {
      const existing = groups.get(record.employeeId);
      if (existing) {
        existing.records.push(record);
      } else {
        groups.set(record.employeeId, {
          employeeName: record.employeeName,
          employeeNumber: record.employeeNumber,
          employeeJobTitle: record.employeeJobTitle,
          employeeDivision: record.employeeDivision,
          employeeSection: record.employeeSection,
          records: [record],
        });
      }
      return groups;
    }, new Map<string, { employeeName: string; employeeNumber: string; employeeJobTitle: string; employeeDivision: string; employeeSection: string; records: DevelopmentRecord[] }>()),
  ).map(([employeeId, group]) => ({ employeeId, ...group }));

  return (
    <div className="space-y-6">
      <PageHeader
        title="Development Records"
        description="Record development needs and follow-up activities for employees."
      />
      <Card>
        <CardContent className="grid gap-4 pt-6 sm:grid-cols-2 lg:grid-cols-4">
          <div className="space-y-1.5 lg:col-span-2">
            <Label htmlFor="development-search">Search</Label>
            <Input
              id="development-search"
              placeholder="Search development needs or notes"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </div>
          <Filter
            label="Employee"
            value={employeeId}
            onChange={setEmployeeId}
            options={(employeesQuery.data ?? []).map((employee) => ({
              value: employee.id,
              label: `${employee.full_name} (${employee.employee_number})`,
            }))}
          />
          <Filter
            label="Status"
            value={status}
            onChange={setStatus}
            options={statuses.map((value) => ({ value, label: value }))}
          />
          <Filter
            label="Development activity"
            value={activity}
            onChange={setActivity}
            options={activities.map((value) => ({ value, label: value }))}
          />
        </CardContent>
      </Card>
      {recordsQuery.isLoading ? (
        <LoadingBlock rows={6} />
      ) : recordsQuery.isError ? (
        <EmptyState
          title="Development records could not be loaded"
          description={(recordsQuery.error as Error).message}
        />
      ) : records.length === 0 ? (
        <EmptyState
          title="No development records"
          description="No development needs have been recorded yet."
        />
      ) : (
        employeeId ? (
          <DevelopmentDetail
            group={recordsByEmployee[0]}
            onBack={() => setEmployeeId("")}
            onEdit={setEditing}
          />
        ) : (
          <div className="border border-border bg-card shadow-sm">
            <Table>
              <caption className="sr-only">Development records by employee</caption>
              <TableHeader>
                <TableRow>
                  <TableHead>Employee ID</TableHead>
                  <TableHead>Full Name</TableHead>
                  <TableHead>Job Title</TableHead>
                  <TableHead>Division / Department</TableHead>
                  <TableHead>Section / Unit</TableHead>
                  <TableHead>Cycle</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {recordsByEmployee.map((group) => (
                  <TableRow key={group.employeeId}>
                    <TableCell className="whitespace-nowrap">
                      <button
                        type="button"
                        className="font-normal text-foreground hover:text-primary hover:underline"
                        onClick={() => setEmployeeId(group.employeeId)}
                      >
                        {group.employeeNumber}
                      </button>
                    </TableCell>
                    <TableCell>
                      <button
                        type="button"
                        className="font-normal text-foreground hover:text-primary hover:underline"
                        onClick={() => setEmployeeId(group.employeeId)}
                      >
                        {group.employeeName}
                      </button>
                    </TableCell>
                    <TableCell>{group.employeeJobTitle || "-"}</TableCell>
                    <TableCell>{group.employeeDivision || "-"}</TableCell>
                    <TableCell>{group.employeeSection || "-"}</TableCell>
                    <TableCell>
                      {group.records[0]?.sourceCycleName
                        ? `${group.records[0].sourceCycleName} (${group.records[0].sourceCycleYear})`
                        : "-"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )
      )}
      <RecordDialog
        open={Boolean(editing)}
        record={editing}
        pending={mutation.isPending}
        error={mutation.error ? (mutation.error as Error).message : null}
        onOpenChange={(open) => {
          if (!open) {
            setEditing(null);
          }
        }}
        onSubmit={(form) => {
          if (editing) mutation.mutate({ ...form, id: editing.id });
        }}
      />
    </div>
  );
}

function MobileCellLabel({ label }: { label: string }) {
  return (
    <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-muted-foreground sm:hidden">
      {label}
    </span>
  );
}

function DevelopmentDetail({
  group,
  onBack,
  onEdit,
}: {
  group: { employeeName: string; employeeNumber: string; records: DevelopmentRecord[] } | undefined;
  onBack: () => void;
  onEdit: (record: DevelopmentRecord) => void;
}) {
  if (!group) return null;
  return (
    <div className="space-y-4">
      <Button variant="outline" onClick={onBack}>
        Back to employees
      </Button>
      <Card>
        <CardContent className="pt-6">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Employee ID
          </p>
          <h2 className="text-xl font-semibold">{group.employeeName}</h2>
          <p className="text-sm text-muted-foreground">{group.employeeNumber}</p>
        </CardContent>
      </Card>
      <div className="space-y-4">
        {group.records.map((record) => (
          <Card key={record.id}>
            <CardContent className="space-y-4 pt-6">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="font-semibold">{record.developmentNeed}</h3>
                  <p className="text-sm text-muted-foreground">
                    {record.developmentActivity} · {humanizeToken(record.status)} · {formatDateTime(record.recordDate)}
                  </p>
                </div>
                <Button variant="outline" size="sm" onClick={() => onEdit(record)}>
                  Edit
                </Button>
              </div>
              <div className="grid gap-4 text-sm sm:grid-cols-2">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Source Evaluation
                  </p>
                  {record.sourceEvaluationId ? (
                    <Link
                      className="text-primary hover:underline"
                      to="/hr/evaluation-history/$evaluationId"
                      params={{ evaluationId: record.sourceEvaluationId }}
                    >
                      {record.sourceCycleName
                        ? `${record.sourceCycleName} (${record.sourceCycleYear})`
                        : "View evaluation"}
                    </Link>
                  ) : (
                    "-"
                  )}
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Notes
                  </p>
                  <p className="mt-1 whitespace-pre-wrap">{record.notes || "-"}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

function RecordList({
  records,
  render,
}: {
  records: DevelopmentRecord[];
  render: (record: DevelopmentRecord) => string;
}) {
  return (
    <ol className="space-y-1">
      {records.map((record) => (
        <li key={record.id} className="break-words">
          <span className="mr-1 text-muted-foreground">
            {records.length > 1 ? `${records.indexOf(record) + 1}.` : ""}
          </span>
          {render(record)}
        </li>
      ))}
    </ol>
  );
}

function Filter({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <select
        className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground shadow-sm"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      >
        <option value="">All</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
}

function RecordDialog({
  open,
  record,
  pending,
  error,
  onOpenChange,
  onSubmit,
}: {
  open: boolean;
  record: DevelopmentRecord | null;
  pending: boolean;
  error: string | null;
  onOpenChange: (open: boolean) => void;
  onSubmit: (form: FormState) => void;
}) {
  const [form, setForm] = useState<FormState>({
    developmentNeed: "",
    developmentActivity: "Coaching",
    status: "Recommended",
    recordDate: "",
    notes: "",
  });
  const [initializedFor, setInitializedFor] = useState<string | null>(null);
  const dialogKey = record?.id ?? (open ? "new" : null);
  useEffect(() => {
    if (dialogKey === initializedFor) return;
    setInitializedFor(dialogKey);
    setForm(
      record
        ? {
            developmentNeed: record.developmentNeed,
            developmentActivity: record.developmentActivity,
            status: record.status,
            recordDate: record.recordDate,
            notes: record.notes,
          }
        : {
            developmentNeed: "",
            developmentActivity: "Coaching",
            status: "Recommended",
            recordDate: "",
            notes: "",
          },
    );
  }, [dialogKey, initializedFor, record]);
  const update = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((current) => ({ ...current, [key]: value }));
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit development record</DialogTitle>
          <DialogDescription>
            Maintain the employee learning and development record.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-2">
          <p className="text-sm text-muted-foreground">
            Employee: {record?.employeeName ?? "-"} ({record?.employeeNumber ?? "-"})
          </p>
          <div className="space-y-1.5">
            <Label htmlFor="development-need">Development Need</Label>
            <Textarea
              id="development-need"
              value={form.developmentNeed}
              onChange={(event) => update("developmentNeed", event.target.value)}
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Filter
              label="Development Activity"
              value={form.developmentActivity}
              onChange={(value) =>
                update("developmentActivity", value as FormState["developmentActivity"])
              }
              options={activities.map((value) => ({ value, label: value }))}
            />
            <Filter
              label="Status"
              value={form.status}
              onChange={(value) => update("status", value as FormState["status"])}
              options={statuses.map((value) => ({ value, label: value }))}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="development-date">Date</Label>
            <Input
              id="development-date"
              type="date"
              value={form.recordDate}
              onChange={(event) => update("recordDate", event.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="development-notes">Notes</Label>
            <Textarea
              id="development-notes"
              value={form.notes}
              onChange={(event) => update("notes", event.target.value)}
            />
          </div>
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button disabled={pending || !form.developmentNeed.trim()} onClick={() => onSubmit(form)}>
            {pending ? "Saving..." : "Save record"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
