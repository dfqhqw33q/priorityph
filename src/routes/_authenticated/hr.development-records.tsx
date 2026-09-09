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
import { EmptyState, LoadingBlock, PageHeader, formatDateTime } from "@/components/shared/shared-ui";
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

  return (
    <div className="space-y-6">
      <PageHeader
        title="Development Records"
        description="Track learning and development needs from finalized performance evaluations."
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
          description="Records will appear when finalized evaluations contain relevant development information."
        />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border bg-card shadow-sm">
          <table className="w-full min-w-[900px] text-left text-sm">
            <caption className="sr-only">Development records</caption>
            <thead className="border-b border-border bg-muted/60">
              <tr>
                {[
                  "Employee",
                  "Development Need",
                  "Activity",
                  "Source Evaluation",
                  "Status",
                  "Date",
                  "Notes",
                  "Actions",
                ].map((heading) => (
                  <th key={heading} className="px-4 py-3 font-semibold">
                    {heading}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {records.map((record) => (
                <tr
                  key={record.id}
                  className="border-b border-border last:border-0 hover:bg-muted/30"
                >
                  <td className="px-4 py-3">
                    <span className="font-semibold">{record.employeeName}</span>
                    <span className="block text-xs text-muted-foreground">
                      {record.employeeNumber}
                    </span>
                  </td>
                  <td className="max-w-xs whitespace-pre-wrap px-4 py-3">
                    {record.developmentNeed}
                  </td>
                  <td className="px-4 py-3">{record.developmentActivity}</td>
                  <td className="px-4 py-3">
                    {record.sourceEvaluationId ? (
                      <Link
                        className="text-primary hover:underline"
                        to="/hr/evaluation-history/$evaluationId"
                        params={{ evaluationId: record.sourceEvaluationId }}
                      >
                        {record.sourceCycleName
                          ? `Performance Evaluation ${record.sourceCycleYear}`
                          : "View evaluation"}
                      </Link>
                    ) : (
                      "-"
                    )}
                  </td>
                  <td className="px-4 py-3">{humanizeToken(record.status)}</td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">
                    {formatDateTime(record.recordDate)}
                  </td>
                  <td className="max-w-xs whitespace-pre-wrap px-4 py-3 text-xs text-muted-foreground">
                    {record.notes || "-"}
                  </td>
                  <td className="px-4 py-3">
                    <Button variant="outline" size="sm" onClick={() => setEditing(record)}>
                      Edit
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
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

