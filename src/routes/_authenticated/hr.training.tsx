import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
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
import { EmptyState, LoadingBlock, PageHeader, formatDateTime } from "@/components/ui-bits";
import {
  listTrainingData,
  listTrainingEmployees,
  updateTrainingRecord,
  type TrainingRecord,
} from "@/lib/training.functions";
import { useDebouncedValue } from "@/hooks/use-debounced-value";

const statuses = ["Required", "Approved", "Completed"] as const;
type FormState = {
  trainingTitle: string;
  provider: string;
  trainingDate: string | null;
  status: (typeof statuses)[number];
  relatedCompetency: string;
  notes: string;
};

export const Route = createFileRoute("/_authenticated/hr/training")({ component: TrainingPage });

function TrainingPage() {
  const queryClient = useQueryClient();
  const fetchTraining = useServerFn(listTrainingData);
  const fetchEmployees = useServerFn(listTrainingEmployees);
  const saveRecord = useServerFn(updateTrainingRecord);
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedValue(search);
  const [employeeId, setEmployeeId] = useState("");
  const [status, setStatus] = useState("");
  const [provider, setProvider] = useState("");
  const [relatedCompetency, setRelatedCompetency] = useState("");
  const [editing, setEditing] = useState<TrainingRecord | null>(null);
  const query = useQuery({
    queryKey: ["training-management", { search: debouncedSearch, employeeId, status, provider, relatedCompetency }],
    queryFn: () =>
      fetchTraining({
        data: {
          search: debouncedSearch,
          employeeId: employeeId || null,
          status: status || null,
          provider,
          relatedCompetency,
        },
      }),
    retry: false,
  });
  const employeesQuery = useQuery({
    queryKey: ["training-employees"],
    queryFn: () => fetchEmployees(),
    retry: false,
  });
  const mutation = useMutation({
    mutationFn: (form: FormState & { id: string }) => saveRecord({ data: form }),
    onSuccess: async () => {
      setEditing(null);
      await queryClient.invalidateQueries({ queryKey: ["training-management"] });
    },
  });
  const data = query.data;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Training Management"
        description="Track third-party training recommendations and official requirements."
      />
      <Card>
        <CardContent className="grid gap-4 pt-6 sm:grid-cols-2 lg:grid-cols-5">
          <div className="space-y-1.5 lg:col-span-2">
            <Label htmlFor="training-search">Search</Label>
            <Input
              id="training-search"
              placeholder="Search training or notes"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </div>
          <SelectFilter
            label="Employee"
            value={employeeId}
            onChange={setEmployeeId}
            options={(employeesQuery.data ?? []).map((employee) => ({
              value: employee.id,
              label: `${employee.full_name} (${employee.employee_number})`,
            }))}
          />
          <SelectFilter
            label="Status"
            value={status}
            onChange={setStatus}
            options={statuses.map((value) => ({ value, label: value }))}
          />
          <div className="space-y-1.5">
            <Label htmlFor="training-provider">Provider</Label>
            <Input
              id="training-provider"
              placeholder="Any provider"
              value={provider}
              onChange={(event) => setProvider(event.target.value)}
            />
          </div>
          <div className="space-y-1.5 sm:col-span-2 lg:col-span-5">
            <Label htmlFor="training-competency">Related competency</Label>
            <Input
              id="training-competency"
              placeholder="Search related competency"
              value={relatedCompetency}
              onChange={(event) => setRelatedCompetency(event.target.value)}
            />
          </div>
        </CardContent>
      </Card>
      {query.isLoading ? (
        <LoadingBlock rows={8} />
      ) : query.isError ? (
        <EmptyState
          title="Training data could not be loaded"
          description={(query.error as Error).message}
        />
      ) : data ? (
        <>
          <TrainingRecommendations recommendations={data.recommendations} />
          <TrainingRecords records={data.records} onEdit={setEditing} />
        </>
      ) : null}
      <RecordDialog
        record={editing}
        pending={mutation.isPending}
        error={mutation.error ? (mutation.error as Error).message : null}
        onClose={() => setEditing(null)}
        onSubmit={(form) => {
          if (editing) mutation.mutate({ ...form, id: editing.id });
        }}
      />
    </div>
  );
}

function TrainingRecommendations({
  recommendations,
}: {
  recommendations: Awaited<ReturnType<typeof listTrainingData>>["recommendations"];
}) {
  return (
    <Card>
      <CardContent className="pt-6">
        <h2 className="mb-4 text-lg font-semibold">Training Recommendations</h2>
        {recommendations.length === 0 ? (
          <EmptyState
            title="No training recommendations"
            description="Recommendations appear after finalized evaluations contain relevant training information."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-left text-sm">
              <thead className="border-b border-border bg-muted/60">
                <tr>
                  {[
                    "Employee",
                    "Training",
                    "Related Competency",
                    "Source",
                    "Recommendation",
                    "Status",
                    "Evaluation",
                  ].map((heading) => (
                    <th key={heading} className="px-4 py-3 font-semibold">
                      {heading}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {recommendations.map((item) => (
                  <tr
                    key={item.id}
                    className="border-b border-border last:border-0 hover:bg-muted/30"
                  >
                    <td className="px-4 py-3">
                      <span className="font-semibold">{item.employeeName}</span>
                      <span className="block text-xs text-muted-foreground">
                        {item.employeeNumber}
                      </span>
                    </td>
                    <td className="px-4 py-3">{item.trainingTitle}</td>
                    <td className="px-4 py-3">{item.relatedCompetency || "—"}</td>
                    <td className="px-4 py-3">{item.source}</td>
                    <td className="max-w-xs whitespace-pre-wrap px-4 py-3">
                      {item.recommendation}
                    </td>
                    <td className="px-4 py-3">{item.status}</td>
                    <td className="px-4 py-3">
                      <Link
                        className="text-primary hover:underline"
                        to="/hr/evaluation-history/$evaluationId"
                        params={{ evaluationId: item.sourceEvaluationId }}
                      >
                        {item.sourceCycleName
                          ? `${item.sourceCycleName} (${item.sourceCycleYear})`
                          : "View"}
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function TrainingRecords({
  records,
  onEdit,
}: {
  records: Awaited<ReturnType<typeof listTrainingData>>["records"];
  onEdit: (record: TrainingRecord) => void;
}) {
  return (
    <Card>
      <CardContent className="pt-6">
        <h2 className="mb-4 text-lg font-semibold">Training Records</h2>
        {records.length === 0 ? (
          <EmptyState
            title="No official training requirements"
            description="Official records appear when the Committee selects Training Required."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1000px] text-left text-sm">
              <thead className="border-b border-border bg-muted/60">
                <tr>
                  {[
                    "Employee",
                    "Training Title / Details",
                    "Provider",
                    "Training Date",
                    "Status",
                    "Source",
                    "Committee Recommendation",
                    "Related Competency",
                    "Related Evaluation",
                    "Actions",
                  ].map((heading) => (
                    <th key={heading} className="px-4 py-3 font-semibold">
                      {heading}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {records.map((item) => (
                  <tr
                    key={item.id}
                    className="border-b border-border last:border-0 hover:bg-muted/30"
                  >
                    <td className="px-4 py-3">
                      <span className="font-semibold">{item.employeeName}</span>
                      <span className="block text-xs text-muted-foreground">
                        {item.employeeNumber}
                      </span>
                    </td>
                    <td className="max-w-xs whitespace-pre-wrap px-4 py-3">{item.trainingTitle}</td>
                    <td className="px-4 py-3">{item.provider || "Not specified"}</td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">
                      {item.trainingDate ? formatDateTime(item.trainingDate) : "Not scheduled"}
                    </td>
                    <td className="px-4 py-3">{item.status}</td>
                    <td className="px-4 py-3">{item.source}</td>
                    <td className="max-w-xs whitespace-pre-wrap px-4 py-3">
                      {item.committeeRecommendation || "Not specified"}
                    </td>
                    <td className="px-4 py-3">{item.relatedCompetency || "Not specified"}</td>
                    <td className="px-4 py-3">
                      <Link
                        className="text-primary hover:underline"
                        to="/hr/evaluation-history/$evaluationId"
                        params={{ evaluationId: item.sourceEvaluationId }}
                      >
                        {item.sourceCycleName
                          ? `${item.sourceCycleName} (${item.sourceCycleYear})`
                          : "View"}
                      </Link>
                    </td>
                    <td className="px-4 py-3">
                      <Button variant="outline" size="sm" onClick={() => onEdit(item)}>
                        Edit
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function SelectFilter({
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
        className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
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
  record,
  pending,
  error,
  onClose,
  onSubmit,
}: {
  record: TrainingRecord | null;
  pending: boolean;
  error: string | null;
  onClose: () => void;
  onSubmit: (form: FormState) => void;
}) {
  const [form, setForm] = useState<FormState>({
    trainingTitle: "",
    provider: "",
    trainingDate: null,
    status: "Required",
    relatedCompetency: "",
    notes: "",
  });
  const [initializedFor, setInitializedFor] = useState<string | null>(null);
  useEffect(() => {
    if (!record || record.id === initializedFor) return;
    setInitializedFor(record.id);
    setForm({
      trainingTitle: record.trainingTitle,
      provider: record.provider,
      trainingDate: record.trainingDate,
      status: record.status,
      relatedCompetency: record.relatedCompetency,
      notes: record.notes,
    });
  }, [initializedFor, record]);
  const update = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((current) => ({ ...current, [key]: value }));
  return (
    <Dialog
      open={Boolean(record)}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit training record</DialogTitle>
          <DialogDescription>
            Maintain third-party provider and training progress information.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-2">
          <p className="text-sm text-muted-foreground">
            Employee: {record?.employeeName ?? "—"} ({record?.employeeNumber ?? "—"})
          </p>
          <div className="space-y-1.5">
            <Label htmlFor="training-title">Training Title</Label>
            <Input
              id="training-title"
              value={form.trainingTitle}
              onChange={(event) => update("trainingTitle", event.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="training-provider-edit">Provider</Label>
            <Input
              id="training-provider-edit"
              value={form.provider}
              onChange={(event) => update("provider", event.target.value)}
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="training-date">Training Date</Label>
              <Input
                id="training-date"
                type="date"
                value={form.trainingDate ?? ""}
                onChange={(event) => update("trainingDate", event.target.value || null)}
              />
            </div>
            <SelectFilter
              label="Status"
              value={form.status}
              onChange={(value) => update("status", value as FormState["status"])}
              options={statuses.map((value) => ({ value, label: value }))}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="training-related-competency">Related Competency</Label>
            <Input
              id="training-related-competency"
              value={form.relatedCompetency}
              onChange={(event) => update("relatedCompetency", event.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="training-notes">Notes</Label>
            <Textarea
              id="training-notes"
              value={form.notes}
              onChange={(event) => update("notes", event.target.value)}
            />
          </div>
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button disabled={pending || !form.trainingTitle.trim()} onClick={() => onSubmit(form)}>
            {pending ? "Saving..." : "Save record"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
