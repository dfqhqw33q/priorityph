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
  createOtherRecognitionCandidate,
  generateRecognitionCertificate,
  listFinalizedEvaluationsForRecognition,
  listRecognitionData,
  listRecognitionEmployees,
  reviewRecognitionCandidate,
  type RecognitionCandidate,
  type RecognitionRecord,
} from "@/features/social-recognition/recognition.functions";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { humanizeToken } from "@/lib/domain";

const types = [
  "Highest Rated Employee",
  "Most Improved Employee",
  "Outstanding Performance",
  "Other Recognition",
] as const;
const statuses = ["PENDING", "APPROVED", "REJECTED"] as const;

export const Route = createFileRoute("/_authenticated/hr/recognition")({
  component: RecognitionPage,
});

function RecognitionPage() {
  const queryClient = useQueryClient();
  const fetchData = useServerFn(listRecognitionData);
  const fetchEmployees = useServerFn(listRecognitionEmployees);
  const fetchEvaluations = useServerFn(listFinalizedEvaluationsForRecognition);
  const review = useServerFn(reviewRecognitionCandidate);
  const createOther = useServerFn(createOtherRecognitionCandidate);
  const certificate = useServerFn(generateRecognitionCertificate);
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedValue(search);
  const [employeeId, setEmployeeId] = useState("");
  const [recognitionType, setRecognitionType] = useState("");
  const [status, setStatus] = useState("PENDING");
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string | null>(null);
  const [reviewing, setReviewing] = useState<RecognitionCandidate | null>(null);
  const [otherOpen, setOtherOpen] = useState(false);
  const dataQuery = useQuery({
    queryKey: ["recognition", { search: debouncedSearch, employeeId, recognitionType, status }],
    queryFn: () =>
      fetchData({
        data: {
          search: debouncedSearch,
          employeeId: employeeId || null,
          recognitionType: (recognitionType || null) as (typeof types)[number] | null,
          status: (status || null) as (typeof statuses)[number] | null,
        },
      }),
    retry: false,
  });
  const employeesQuery = useQuery({
    queryKey: ["recognition-employees"],
    queryFn: () => fetchEmployees(),
    retry: false,
  });
  const evaluationsQuery = useQuery({
    queryKey: ["recognition-evaluations"],
    queryFn: () => fetchEvaluations(),
    retry: false,
  });
  const mutation = useMutation({
    mutationFn: (input: { id: string; decision: "APPROVED" | "REJECTED"; reviewNotes: string }) =>
      review({ data: input }),
    onSuccess: async () => {
      setReviewing(null);
      await queryClient.invalidateQueries({ queryKey: ["recognition"] });
    },
  });
  const otherMutation = useMutation({
    mutationFn: (input: { employeeId: string; sourceEvaluationId: string; reason: string }) =>
      createOther({ data: input }),
    onSuccess: async () => {
      setOtherOpen(false);
      await queryClient.invalidateQueries({ queryKey: ["recognition"] });
    },
  });
  const download = async (record: RecognitionRecord) => {
    const result = await certificate({ data: { recordId: record.id } });
    const link = document.createElement("a");
    link.href = `data:application/pdf;base64,${result.base64}`;
    link.download = result.fileName;
    link.click();
  };
  const data = dataQuery.data;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Social Recognition"
        description="Review employee recognition candidates and record decisions."
        actions={<Button onClick={() => setOtherOpen(true)}>Other recognition</Button>}
      />
      <Card>
        <CardContent className="grid gap-4 pt-6 sm:grid-cols-2 lg:grid-cols-4">
          <div className="space-y-1.5 lg:col-span-2">
            <Label htmlFor="recognition-search">Search</Label>
            <Input
              id="recognition-search"
              placeholder="Search recognition reasons"
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
            label="Recognition type"
            value={recognitionType}
            onChange={setRecognitionType}
            options={types.map((value) => ({ value, label: value }))}
          />
          <SelectFilter
            label="Status"
            value={status}
            onChange={setStatus}
            options={statuses.map((value) => ({ value, label: value }))}
          />
        </CardContent>
      </Card>
      {dataQuery.isLoading ? (
        <LoadingBlock rows={8} />
      ) : dataQuery.isError ? (
        <EmptyState
          title="Recognition data could not be loaded"
          description={(dataQuery.error as Error).message}
        />
      ) : data ? (
        <>
          <RecognitionDirectory
            candidates={data.candidates}
            records={data.records}
            selectedEmployeeId={selectedEmployeeId}
            onSelect={setSelectedEmployeeId}
            onBack={() => setSelectedEmployeeId(null)}
            onReview={setReviewing}
            onCertificate={download}
          />
        </>
      ) : null}
      <ReviewDialog
        candidate={reviewing}
        pending={mutation.isPending}
        error={mutation.error ? (mutation.error as Error).message : null}
        onClose={() => setReviewing(null)}
        onSubmit={(decision, reviewNotes) => {
          if (reviewing) mutation.mutate({ id: reviewing.id, decision, reviewNotes });
        }}
      />
      <OtherDialog
        open={otherOpen}
        employees={employeesQuery.data ?? []}
        evaluations={evaluationsQuery.data ?? []}
        pending={otherMutation.isPending}
        error={otherMutation.error ? (otherMutation.error as Error).message : null}
        onClose={() => setOtherOpen(false)}
        onSubmit={(input) => otherMutation.mutate(input)}
      />
    </div>
  );
}

function RecognitionDirectory({
  candidates,
  records,
  selectedEmployeeId,
  onSelect,
  onBack,
  onReview,
  onCertificate,
}: {
  candidates: RecognitionCandidate[];
  records: RecognitionRecord[];
  selectedEmployeeId: string | null;
  onSelect: (employeeId: string) => void;
  onBack: () => void;
  onReview: (candidate: RecognitionCandidate) => void;
  onCertificate: (record: RecognitionRecord) => void;
}) {
  const employees = Array.from(
    new Map(
      [...candidates, ...records].map((item) => [
        item.employeeId,
        { employeeId: item.employeeId, employeeName: item.employeeName, employeeNumber: item.employeeNumber, employeeJobTitle: item.employeeJobTitle, employeeDivision: item.employeeDivision, employeeSection: item.employeeSection },
      ]),
    ).values(),
  );
  if (selectedEmployeeId) {
    const employee = employees.find((item) => item.employeeId === selectedEmployeeId);
    return <RecognitionDetail employee={employee} candidates={candidates.filter((item) => item.employeeId === selectedEmployeeId)} records={records.filter((item) => item.employeeId === selectedEmployeeId)} onBack={onBack} onReview={onReview} onCertificate={onCertificate} />;
  }
  return (
    <div className="border border-border bg-card shadow-sm">
      <Table>
        <caption className="sr-only">Recognition records by employee</caption>
        <TableHeader><TableRow><TableHead>Employee ID</TableHead><TableHead>Full Name</TableHead><TableHead>Job Title</TableHead><TableHead>Division / Department</TableHead><TableHead>Section / Unit</TableHead><TableHead>Recognition Type</TableHead><TableHead>Status</TableHead><TableHead>Recognition Date</TableHead></TableRow></TableHeader>
        <TableBody>{employees.map((employee) => { const source = [...candidates, ...records].find((item) => item.employeeId === employee.employeeId); return <TableRow key={employee.employeeId}><TableCell className="whitespace-nowrap"><button type="button" className="font-semibold text-primary hover:underline" onClick={() => onSelect(employee.employeeId)}>{employee.employeeNumber}</button></TableCell><TableCell><button type="button" className="font-semibold text-primary hover:underline" onClick={() => onSelect(employee.employeeId)}>{employee.employeeName}</button></TableCell><TableCell>{employee.employeeJobTitle || "-"}</TableCell><TableCell>{employee.employeeDivision || "-"}</TableCell><TableCell>{employee.employeeSection || "-"}</TableCell><TableCell>{source?.recognitionType ?? "-"}</TableCell><TableCell>{source ? humanizeToken(source.status) : "-"}</TableCell><TableCell>{"recognitionDate" in (source ?? {}) ? formatDateTime((source as RecognitionRecord).recognitionDate) : "-"}</TableCell></TableRow>; })}</TableBody>
      </Table>
    </div>
  );
}

function RecognitionDetail({
  employee,
  candidates,
  records,
  onBack,
  onReview,
  onCertificate,
}: {
  employee: { employeeName: string; employeeNumber: string } | undefined;
  candidates: RecognitionCandidate[];
  records: RecognitionRecord[];
  onBack: () => void;
  onReview: (candidate: RecognitionCandidate) => void;
  onCertificate: (record: RecognitionRecord) => void;
}) {
  if (!employee) return null;
  return (
    <div className="space-y-4">
      <Button variant="outline" onClick={onBack}>Back to employees</Button>
      <Card><CardContent className="pt-6"><p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Employee ID</p><h2 className="text-xl font-semibold">{employee.employeeName}</h2><p className="text-sm text-muted-foreground">{employee.employeeNumber}</p></CardContent></Card>
      {candidates.map((candidate) => <Card key={candidate.id}><CardContent className="space-y-3 pt-6"><div className="flex items-start justify-between gap-3"><div><p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{humanizeToken(candidate.status)}</p><h3 className="font-semibold">{candidate.recognitionType}</h3></div>{candidate.status === "PENDING" ? <Button variant="outline" size="sm" onClick={() => onReview(candidate)}>Review</Button> : null}</div><p className="whitespace-pre-wrap text-sm">{candidate.reason}</p><Link className="text-primary hover:underline" to="/hr/evaluation-history/$evaluationId" params={{ evaluationId: candidate.sourceEvaluationId }}>{candidate.sourceCycleName ? `${candidate.sourceCycleName} (${candidate.sourceCycleYear})` : "View evaluation"}</Link></CardContent></Card>)}
      {records.map((record) => <Card key={record.id}><CardContent className="space-y-3 pt-6"><div className="flex items-start justify-between gap-3"><div><p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Approved Recognition</p><h3 className="font-semibold">{record.recognitionType}</h3></div><Button variant="outline" size="sm" onClick={() => onCertificate(record)}>Certificate</Button></div><p className="whitespace-pre-wrap text-sm">{record.reason}</p><p className="text-sm text-muted-foreground">Recognition Date: {formatDateTime(record.recognitionDate)} · Approved: {formatDateTime(record.approvedAt)}</p><Link className="text-primary hover:underline" to="/hr/evaluation-history/$evaluationId" params={{ evaluationId: record.sourceEvaluationId }}>{record.sourceCycleName ? `${record.sourceCycleName} (${record.sourceCycleYear})` : "View evaluation"}</Link></CardContent></Card>)}
    </div>
  );
}

function Candidates({
  candidates,
  onReview,
}: {
  candidates: RecognitionCandidate[];
  onReview: (candidate: RecognitionCandidate) => void;
}) {
  return (
    <Card>
      <CardContent className="pt-6">
        <h2 className="mb-4 text-lg font-semibold">Recognition Candidates</h2>
        {candidates.length === 0 ? (
          <EmptyState
            title="No recognition candidates"
            description="Candidates appear after finalized evaluations meet the recognition criteria."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[950px] text-left text-sm">
              <thead className="border-b border-primary/30 bg-primary text-primary-foreground dark:border-border dark:bg-muted/60 dark:text-foreground">
                <tr>
                  {["Employee", "Type", "Reason", "Source Evaluation", "Status", "Actions"].map(
                    (heading) => (
                      <th key={heading} className="px-4 py-3 font-semibold">
                        {heading}
                      </th>
                    ),
                  )}
                </tr>
              </thead>
              <tbody>
                {candidates.map((candidate) => (
                  <tr
                    key={candidate.id}
                    className="border-b border-border last:border-0 hover:bg-muted/30"
                  >
                    <td className="px-4 py-3">
                      <span className="font-semibold">{candidate.employeeName}</span>
                      <span className="block text-xs text-muted-foreground">
                        {candidate.employeeNumber}
                      </span>
                    </td>
                    <td className="px-4 py-3">{candidate.recognitionType}</td>
                    <td className="max-w-md whitespace-pre-wrap px-4 py-3">{candidate.reason}</td>
                    <td className="px-4 py-3">
                      <Link
                        className="text-primary hover:underline"
                        to="/hr/evaluation-history/$evaluationId"
                        params={{ evaluationId: candidate.sourceEvaluationId }}
                      >
                        {candidate.sourceCycleName
                          ? `${candidate.sourceCycleName} (${candidate.sourceCycleYear})`
                          : "View"}
                      </Link>
                    </td>
                    <td className="px-4 py-3">{humanizeToken(candidate.status)}</td>
                    <td className="px-4 py-3">
                      {candidate.status === "PENDING" ? (
                        <Button variant="outline" size="sm" onClick={() => onReview(candidate)}>
                          Review
                        </Button>
                      ) : (
                        "Reviewed"
                      )}
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

function History({
  records,
  onCertificate,
}: {
  records: RecognitionRecord[];
  onCertificate: (record: RecognitionRecord) => void;
}) {
  return (
    <Card>
      <CardContent className="pt-6">
        <h2 className="mb-4 text-lg font-semibold">Recognition History</h2>
        {records.length === 0 ? (
          <EmptyState
            title="No approved recognition yet"
            description="Approved recognition records appear here."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-left text-sm">
              <thead className="border-b border-primary/30 bg-primary text-primary-foreground dark:border-border dark:bg-muted/60 dark:text-foreground">
                <tr>
                  {[
                    "Employee",
                    "Type",
                    "Reason",
                    "Recognition Date",
                    "Source Evaluation",
                    "Certificate",
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
                    <td className="px-4 py-3">{record.recognitionType}</td>
                    <td className="max-w-md whitespace-pre-wrap px-4 py-3">{record.reason}</td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">
                      {formatDateTime(record.recognitionDate)}
                    </td>
                    <td className="px-4 py-3">
                      <Link
                        className="text-primary hover:underline"
                        to="/hr/evaluation-history/$evaluationId"
                        params={{ evaluationId: record.sourceEvaluationId }}
                      >
                        {record.sourceCycleName
                          ? `${record.sourceCycleName} (${record.sourceCycleYear})`
                          : "View"}
                      </Link>
                    </td>
                    <td className="px-4 py-3">
                      <Button variant="outline" size="sm" onClick={() => onCertificate(record)}>
                        Generate Certificate
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

function ReviewDialog({
  candidate,
  pending,
  error,
  onClose,
  onSubmit,
}: {
  candidate: RecognitionCandidate | null;
  pending: boolean;
  error: string | null;
  onClose: () => void;
  onSubmit: (decision: "APPROVED" | "REJECTED", notes: string) => void;
}) {
  const [notes, setNotes] = useState("");
  const [initializedFor, setInitializedFor] = useState<string | null>(null);
  useEffect(() => {
    if (!candidate || candidate.id === initializedFor) return;
    setInitializedFor(candidate.id);
    setNotes("");
  }, [candidate, initializedFor]);
  return (
    <Dialog
      open={Boolean(candidate)}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Review recognition candidate</DialogTitle>
          <DialogDescription>
            {candidate?.employeeName} - {candidate?.recognitionType}
          </DialogDescription>
        </DialogHeader>
        <p className="whitespace-pre-wrap text-sm">{candidate?.reason}</p>
        <div className="space-y-1.5">
          <Label htmlFor="recognition-review-notes">Review notes</Label>
          <Textarea
            id="recognition-review-notes"
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
          />
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            disabled={pending}
            onClick={() => onSubmit("REJECTED", notes)}
          >
            Reject
          </Button>
          <Button disabled={pending} onClick={() => onSubmit("APPROVED", notes)}>
            Approve
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function OtherDialog({
  open,
  employees,
  evaluations,
  pending,
  error,
  onClose,
  onSubmit,
}: {
  open: boolean;
  employees: { id: string; full_name: string; employee_number: string }[];
  evaluations: {
    id: string;
    employee_id: string;
    full_name_snapshot: string;
    employee_number_snapshot: string;
    evaluation_cycles?: { name?: string; year?: number } | null;
  }[];
  pending: boolean;
  error: string | null;
  onClose: () => void;
  onSubmit: (input: { employeeId: string; sourceEvaluationId: string; reason: string }) => void;
}) {
  const [employeeId, setEmployeeId] = useState("");
  const [sourceEvaluationId, setSourceEvaluationId] = useState("");
  const [reason, setReason] = useState("");
  const available = evaluations.filter(
    (evaluation) => !employeeId || evaluation.employee_id === employeeId,
  );
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Other recognition</DialogTitle>
          <DialogDescription>
            Create a pending candidate for authorized HR/management review.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <SelectFilter
            label="Employee"
            value={employeeId}
            onChange={(value) => {
              setEmployeeId(value);
              setSourceEvaluationId("");
            }}
            options={employees.map((employee) => ({
              value: employee.id,
              label: `${employee.full_name} (${employee.employee_number})`,
            }))}
          />
          <SelectFilter
            label="Finalized source evaluation"
            value={sourceEvaluationId}
            onChange={setSourceEvaluationId}
            options={available.map((evaluation) => ({
              value: evaluation.id,
              label: `${evaluation.full_name_snapshot}  -  ${evaluation.evaluation_cycles?.year ?? ""}`,
            }))}
          />
          <div className="space-y-1.5">
            <Label htmlFor="other-recognition-reason">Reason</Label>
            <Textarea
              id="other-recognition-reason"
              value={reason}
              onChange={(event) => setReason(event.target.value)}
            />
          </div>
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            disabled={pending || !employeeId || !sourceEvaluationId || !reason.trim()}
            onClick={() => onSubmit({ employeeId, sourceEvaluationId, reason })}
          >
            Create candidate
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
