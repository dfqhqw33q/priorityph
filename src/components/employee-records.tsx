import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useRef, useState } from "react";
import type { RefObject } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  EmptyState,
  EvaluationStatusBadge,
  LoadingBlock,
  PageHeader,
  formatDateTime,
} from "@/components/ui-bits";
import { EvaluationDocumentPreview } from "@/components/evaluation-document-preview";
import { listDigital201Employees } from "@/lib/reports.functions";
import {
  getEvaluationDocumentUrl,
  getEmployeeDocumentUrl,
  listEmployeeDocuments,
  uploadEmployeeDocument,
  getEvaluationSheetHtml,
} from "@/lib/documents.functions";
import { getDigital201File } from "@/lib/reports.functions";
import type { EvaluationStatus } from "@/lib/domain";

type EmployeeRow = {
  id: string;
  employee_number: string;
  full_name: string;
  job_title: string;
  division: string;
  section: string;
  employment_status: string;
  created_at: string;
};

type HistoryRating = {
  criterionId: string;
  evaluatorType: string;
  rating: number;
  criterion: { id: string; letter: string; title: string; position: number } | null;
};

type HistoryEvaluation = {
  id: string;
  cycleName: string;
  cycleYear: number;
  status: string;
  employeeSubmittedAt: string | null;
  supervisorSubmittedAt: string | null;
  finalizedAt: string | null;
  jobTitle: string;
  division: string;
  section: string;
  scores: {
    employeeAverage: number | null;
    supervisorAverage: number | null;
    reviewingSupervisorAverage: number | null;
    finalScore: number | null;
    finalRatingLabel: string | null;
  } | null;
  ratings: HistoryRating[];
};

export function EmployeeRecordsPage({ allow201 = true }: { allow201?: boolean }) {
  const fetchEmployees = useServerFn(listDigital201Employees);
  const fetch201File = useServerFn(getDigital201File);
  const fetchDocuments = useServerFn(listEmployeeDocuments);
  const getDocumentUrl = useServerFn(getEmployeeDocumentUrl);
  const getFinalEvaluationDocumentUrl = useServerFn(getEvaluationDocumentUrl);
  const getSheetHtml = useServerFn(getEvaluationSheetHtml);
  const uploadDocument = useServerFn(uploadEmployeeDocument);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const [selectedEvaluationId, setSelectedEvaluationId] = useState<string | null>(null);
  const [comparisonEvaluationId, setComparisonEvaluationId] = useState<string | null>(null);
  const [compareOpen, setCompareOpen] = useState(false);
  const [comparisonFirstId, setComparisonFirstId] = useState("");
  const [comparisonSecondId, setComparisonSecondId] = useState("");
  const [documentCategory, setDocumentCategory] = useState("SUPPORTING_DOCUMENTS");
  const [uploading, setUploading] = useState(false);
  const [documentHtml, setDocumentHtml] = useState<string | null>(null);
  const [documentOpen, setDocumentOpen] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const query = useQuery({
    queryKey: ["employees"],
    queryFn: () => fetchEmployees(),
    retry: false,
  });

  const detailQuery = useQuery({
    queryKey: ["digital-201-file", selected, selectedEvaluationId, comparisonEvaluationId],
    queryFn: () =>
      fetch201File({
        data: {
          employeeId: selected as string,
          selectedEvaluationId,
          comparisonEvaluationId,
          page: 0,
          pageSize: 25,
        },
      }),
    enabled: selected !== null,
    retry: false,
  });

  const documentsQuery = useQuery({
    queryKey: ["employee-documents", selected],
    queryFn: () => fetchDocuments({ data: { employeeId: selected as string } }),
    enabled: selected !== null,
    retry: false,
  });

  async function handleUpload(file: File) {
    if (!selected) return;
    setUploading(true);
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      let binary = "";
      for (const byte of bytes) binary += String.fromCharCode(byte);
      await uploadDocument({
        data: {
          employeeId: selected,
          category: documentCategory as never,
          fileName: file.name,
          contentType: file.type,
          contentBase64: btoa(binary),
        },
      });
      await documentsQuery.refetch();
    } catch (error) {
      window.alert(error instanceof Error ? error.message : "Could not upload document");
    } finally {
      setUploading(false);
      if (fileInput.current) fileInput.current.value = "";
    }
  }

  async function openDocument(documentId: string) {
    const result = await getDocumentUrl({ data: { documentId } });
    window.open(result.url, "_blank", "noopener,noreferrer");
  }

  async function openFinalEvaluationDocument(
    evaluationId: string,
    mode: "preview" | "print" | "export",
  ) {
    setDocumentOpen(true);
    try {
      const result = await getSheetHtml({ data: { evaluationId } });
      setDocumentHtml(result.html);

      // Handle print/export after document loads
      if (mode === "print") {
        setTimeout(() => {
          const frame = document.querySelector(
            'iframe[title="Evaluation document preview"]',
          ) as HTMLIFrameElement;
          frame?.contentWindow?.print();
        }, 600);
      } else if (mode === "export") {
        // For export, user can use browser's Print to PDF
        setTimeout(() => {
          const frame = document.querySelector(
            'iframe[title="Evaluation document preview"]',
          ) as HTMLIFrameElement;
          frame?.focus();
        }, 300);
      }
    } catch (error) {
      setDocumentOpen(false);
      toast.error(
        error instanceof Error
          ? error.message
          : "The final evaluation document is not available yet.",
      );
    }
  }

  const rows = useMemo(() => {
    const list = (query.data ?? []) as EmployeeRow[];
    const term = search.trim().toLowerCase();
    if (!term) return list;
    return list.filter(
      (row) =>
        row.employee_number.toLowerCase().includes(term) ||
        row.full_name.toLowerCase().includes(term) ||
        row.division.toLowerCase().includes(term) ||
        row.section.toLowerCase().includes(term),
    );
  }, [query.data, search]);

  if (query.isError) {
    const message = query.error instanceof Error ? query.error.message : "Unavailable";
    return <EmptyState title="You do not have access to employee records" description={message} />;
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Employee records"
        description="Employee records are created automatically the first time an employee submits a self-assessment."
      />

      <div className="max-w-sm space-y-1.5">
        <Label htmlFor="employee-search">Search</Label>
        <Input
          id="employee-search"
          placeholder="Number, name, division or section"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
      </div>

      {query.isLoading ? (
        <LoadingBlock rows={5} />
      ) : rows.length === 0 ? (
        <EmptyState
          title="No employee records yet"
          description="Records appear once employees submit their self-assessments."
        />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border bg-card shadow-sm">
          <Table>
            <caption className="sr-only">Employee records</caption>
            <TableHeader>
              <TableRow>
                <TableHead scope="col">Employee no.</TableHead>
                <TableHead scope="col">Full name</TableHead>
                <TableHead scope="col">Job title</TableHead>
                <TableHead scope="col">Division / section</TableHead>
                <TableHead scope="col">Status</TableHead>
                <TableHead scope="col">Created</TableHead>
                <TableHead scope="col" className="text-right">
                  Action
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.id}>
                  <TableCell className="tabular-nums">{row.employee_number}</TableCell>
                  <TableCell className="font-medium">{row.full_name}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{row.job_title}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {row.division}
                    {row.section ? ` · ${row.section}` : ""}
                  </TableCell>
                  <TableCell>
                    <Badge variant={row.employment_status === "ACTIVE" ? "secondary" : "outline"}>
                      {row.employment_status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {formatDateTime(row.created_at)}
                  </TableCell>
                  <TableCell className="text-right">
                    {allow201 ? (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setSelected(row.id);
                          setSelectedEvaluationId(null);
                          setComparisonEvaluationId(null);
                          setCompareOpen(false);
                          setComparisonFirstId("");
                          setComparisonSecondId("");
                        }}
                      >
                        History
                      </Button>
                    ) : null}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <Dialog
        open={selected !== null}
        onOpenChange={(open) => {
          if (!open) {
            setSelected(null);
            setSelectedEvaluationId(null);
            setComparisonEvaluationId(null);
            setCompareOpen(false);
            setComparisonFirstId("");
            setComparisonSecondId("");
          }
        }}
      >
        <DialogContent className="max-h-[90vh] w-[calc(100%-2rem)] max-w-4xl overflow-y-auto p-0">
          <DialogHeader className="border-b border-border px-6 py-5 pr-12">
            <DialogTitle>{detailQuery.data?.employee.full_name ?? "Employee File"}</DialogTitle>
            <DialogDescription>
              Digital 201 File · Employee records and evaluation history
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-5 px-6 pb-6">
            {detailQuery.isLoading ? (
              <LoadingBlock rows={3} />
            ) : detailQuery.isError ? (
              <EmptyState
                title="Digital 201 File could not be loaded"
                description={(detailQuery.error as Error).message}
              />
            ) : (detailQuery.data?.history ?? []).length === 0 ? (
              <p className="text-sm text-muted-foreground">No evaluations recorded yet.</p>
            ) : (
              <EmployeeFileContent
                employee={detailQuery.data?.employee}
                history={(detailQuery.data?.history ?? []) as unknown as HistoryEvaluation[]}
                totalCount={detailQuery.data?.totalCount ?? 0}
                onOpenDocument={openFinalEvaluationDocument}
                onCompare={() => setCompareOpen(true)}
              />
            )}
            <DocumentSections
              documents={documentsQuery.data ?? []}
              loading={documentsQuery.isLoading}
              documentCategory={documentCategory}
              onCategoryChange={setDocumentCategory}
              fileInput={fileInput}
              uploading={uploading}
              onUpload={handleUpload}
              onOpenDocument={openDocument}
              evaluationCount={
                (detailQuery.data?.history ?? []).filter((item) => item.status === "FINALIZED")
                  .length
              }
            />
          </div>
        </DialogContent>
      </Dialog>

      <Dialog
        open={compareOpen}
        onOpenChange={(open) => {
          setCompareOpen(open);
          if (!open) {
            setSelectedEvaluationId(null);
            setComparisonEvaluationId(null);
            setComparisonFirstId("");
            setComparisonSecondId("");
          }
        }}
      >
        <DialogContent className="max-h-[90vh] w-[calc(100%-2rem)] max-w-5xl overflow-y-auto p-0">
          <DialogHeader className="border-b border-border px-6 py-5 pr-12">
            <DialogTitle>Compare performance evaluations</DialogTitle>
            <DialogDescription>
              Select two different evaluation periods to compare.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-5 px-6 pb-6">
            {!selectedEvaluationId || !comparisonEvaluationId ? (
              <ComparisonPicker
                evaluations={(detailQuery.data?.history ?? []) as unknown as HistoryEvaluation[]}
                firstId={comparisonFirstId}
                secondId={comparisonSecondId}
                onFirstChange={setComparisonFirstId}
                onSecondChange={setComparisonSecondId}
                onCancel={() => setCompareOpen(false)}
                onCompare={() => {
                  setSelectedEvaluationId(comparisonFirstId);
                  setComparisonEvaluationId(comparisonSecondId);
                }}
              />
            ) : detailQuery.isFetching ||
              !detailQuery.data?.selected ||
              !detailQuery.data?.comparison ? (
              <LoadingBlock rows={6} />
            ) : (
              <ComparisonResults
                selected={detailQuery.data?.selected as unknown as HistoryEvaluation | null}
                comparison={detailQuery.data?.comparison as unknown as HistoryEvaluation | null}
                onBack={() => {
                  setSelectedEvaluationId(null);
                  setComparisonEvaluationId(null);
                }}
              />
            )}
          </div>
        </DialogContent>
      </Dialog>

      <EvaluationDocumentPreview
        html={documentHtml}
        open={documentOpen}
        loading={documentOpen && !documentHtml}
        onOpenChange={(open) => {
          setDocumentOpen(open);
          if (!open) setDocumentHtml(null);
        }}
      />
    </div>
  );
}

function FileCategory({ label, count = 0 }: { label: string; count?: number }) {
  return (
    <div className="flex items-center justify-between rounded-md border border-border px-3 py-2">
      <span>{label}</span>
      <span className="text-xs text-muted-foreground">{count} records</span>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-1 font-medium text-foreground">{value || "—"}</p>
    </div>
  );
}

function EmployeeFileContent({
  employee,
  history,
  totalCount,
  onOpenDocument,
  onCompare,
}: {
  employee:
    | {
        full_name?: string;
        employee_number?: string;
        job_title?: string;
        division?: string;
        section?: string;
        employment_status?: string;
      }
    | undefined;
  history: HistoryEvaluation[];
  totalCount: number;
  onOpenDocument: (evaluationId: string, mode: "preview" | "print" | "export") => void;
  onCompare: () => void;
}) {
  return (
    <div className="space-y-5">
      <div className="grid gap-3 border-b border-border pb-4 sm:grid-cols-[1fr_auto]">
        <div>
          <p className="text-lg font-semibold">{employee?.full_name ?? "Employee"}</p>
          <p className="text-sm text-muted-foreground">
            Employee no. {employee?.employee_number ?? "—"}
          </p>
          <p className="mt-1 text-sm text-foreground">
            {employee?.job_title ?? "—"} · {employee?.division ?? "—"}
            {employee?.section ? ` · ${employee.section}` : ""}
          </p>
        </div>
        <div className="text-left text-sm sm:text-right">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Employment status</p>
          <p className="mt-1 font-medium">{employee?.employment_status ?? "—"}</p>
        </div>
      </div>

      <section aria-labelledby="performance-evaluations-heading">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div>
            <h3 id="performance-evaluations-heading" className="font-semibold">
              Performance Evaluations
            </h3>
            <p className="text-xs text-muted-foreground">
              {totalCount} historical record{totalCount === 1 ? "" : "s"}
            </p>
          </div>
          {history.length > 1 ? (
            <Button size="sm" onClick={onCompare}>
              Compare Evaluations
            </Button>
          ) : null}
        </div>
        <div className="divide-y divide-border rounded-md border border-border">
          {history.map((item) => (
            <div
              key={item.id}
              className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between"
            >
              <div>
                <p className="font-medium">
                  {item.cycleName} ({item.cycleYear})
                </p>
                <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  <EvaluationStatusBadge status={item.status as EvaluationStatus} />
                  <span>{item.jobTitle}</span>
                  <span>·</span>
                  <span>{item.division}</span>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  Finalized {formatDateTime(item.finalizedAt)}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                {item.status === "FINALIZED" ? (
                  <>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => onOpenDocument(item.id, "preview")}
                    >
                      Preview
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => onOpenDocument(item.id, "print")}
                    >
                      Print
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => onOpenDocument(item.id, "export")}
                    >
                      Export
                    </Button>
                  </>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function DocumentSections({
  documents,
  loading,
  documentCategory,
  onCategoryChange,
  fileInput,
  uploading,
  onUpload,
  onOpenDocument,
  evaluationCount,
}: {
  documents: Array<{ id: string; file_name: string; category: string }>;
  loading: boolean;
  documentCategory: string;
  onCategoryChange: (value: string) => void;
  fileInput: RefObject<HTMLInputElement | null>;
  uploading: boolean;
  onUpload: (file: File) => void;
  onOpenDocument: (id: string) => void;
  evaluationCount: number;
}) {
  const categories = [
    ["Awards and Recognition", "AWARDS_RECOGNITION"],
    ["Training and Certificates", "TRAINING_CERTIFICATES"],
    ["Supporting Documents", "SUPPORTING_DOCUMENTS"],
    ["Other Documents", "OTHER_DOCUMENTS"],
  ];
  return (
    <div className="space-y-2">
      <FileCategory label="Performance Evaluations" count={evaluationCount} />
      {categories.map(([label, category]) => {
        const records = documents.filter((document) => document.category === category);
        return (
          <details key={category} className="rounded-md border border-border px-4 py-3">
            <summary className="cursor-pointer list-none font-medium">
              {label}
              <span className="ml-2 text-xs font-normal text-muted-foreground">
                {records.length} records
              </span>
            </summary>
            <div className="mt-3 space-y-2">
              {loading ? (
                <LoadingBlock rows={1} />
              ) : records.length ? (
                records.map((document) => (
                  <button
                    key={document.id}
                    type="button"
                    className="flex w-full justify-between rounded border border-border px-3 py-2 text-left text-sm hover:bg-muted"
                    onClick={() => onOpenDocument(document.id)}
                  >
                    <span>{document.file_name}</span>
                    <span className="text-xs text-muted-foreground">Open</span>
                  </button>
                ))
              ) : (
                <p className="text-xs text-muted-foreground">No records available.</p>
              )}
            </div>
          </details>
        );
      })}
      <div className="flex flex-wrap gap-2 pt-2">
        <select
          className="h-9 rounded-md border border-input bg-background px-3 text-sm"
          value={documentCategory}
          onChange={(event) => onCategoryChange(event.target.value)}
          aria-label="Document category"
        >
          {categories.map(([label, category]) => (
            <option key={category} value={category}>
              {label}
            </option>
          ))}
        </select>
        <input
          ref={fileInput}
          type="file"
          className="max-w-full text-sm"
          disabled={uploading}
          onChange={(event) => event.target.files?.[0] && onUpload(event.target.files[0])}
        />
      </div>
    </div>
  );
}

function ComparisonPicker({
  evaluations,
  firstId,
  secondId,
  onFirstChange,
  onSecondChange,
  onCancel,
  onCompare,
}: {
  evaluations: HistoryEvaluation[];
  firstId: string;
  secondId: string;
  onFirstChange: (value: string) => void;
  onSecondChange: (value: string) => void;
  onCancel: () => void;
  onCompare: () => void;
}) {
  const valid = firstId !== "" && secondId !== "" && firstId !== secondId;
  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <PeriodSelect
          label="First evaluation period"
          value={firstId}
          options={evaluations}
          onChange={onFirstChange}
        />
        <PeriodSelect
          label="Second evaluation period"
          value={secondId}
          options={evaluations}
          onChange={onSecondChange}
        />
      </div>
      <div className="flex justify-end gap-2 border-t border-border pt-4">
        <Button variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button disabled={!valid} onClick={onCompare}>
          Compare
        </Button>
      </div>
    </div>
  );
}

function ComparisonResults({
  selected,
  comparison,
  onBack,
}: {
  selected: HistoryEvaluation | null;
  comparison: HistoryEvaluation | null;
  onBack: () => void;
}) {
  const criteria = Array.from(
    new Map(
      [...(selected?.ratings ?? []), ...(comparison?.ratings ?? [])]
        .filter((rating) => rating.criterion)
        .map((rating) => [rating.criterionId, rating.criterion]),
    ).values(),
  ).sort((a, b) => (a?.position ?? 0) - (b?.position ?? 0));
  return (
    <div className="space-y-5">
      <div className="grid gap-3 md:grid-cols-2">
        <PeriodSummary label="Selected evaluation" evaluation={selected} />
        <PeriodSummary label="Comparison evaluation" evaluation={comparison} />
      </div>
      <div className="overflow-x-auto rounded-md border border-border">
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead className="bg-muted/50">
            <tr>
              <th className="px-3 py-2">Criterion</th>
              <th className="px-3 py-2">Selected</th>
              <th className="px-3 py-2">Comparison</th>
              <th className="px-3 py-2">Difference</th>
              <th className="px-3 py-2">Trend</th>
            </tr>
          </thead>
          <tbody>
            {criteria.map((criterion) => {
              const current = ratingFor(selected, criterion?.id ?? "", "SUPERVISOR");
              const previous = ratingFor(comparison, criterion?.id ?? "", "SUPERVISOR");
              const difference = current !== null && previous !== null ? current - previous : null;
              return (
                <tr key={criterion?.id} className="border-t border-border">
                  <td className="px-3 py-2">
                    <strong>{criterion?.letter}</strong> {criterion?.title}
                  </td>
                  <td className="px-3 py-2">{current ?? "—"}</td>
                  <td className="px-3 py-2">{previous ?? "—"}</td>
                  <td className="px-3 py-2">
                    {difference === null ? "—" : difference > 0 ? `+${difference}` : difference}
                  </td>
                  <td className="px-3 py-2">
                    {difference === null
                      ? "—"
                      : difference > 0
                        ? "Increase"
                        : difference < 0
                          ? "Decrease"
                          : "Unchanged"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="flex justify-end">
        <Button variant="outline" onClick={onBack}>
          Back to periods
        </Button>
      </div>
    </div>
  );
}

function PeriodSelect({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: HistoryEvaluation[];
  onChange: (value: string) => void;
}) {
  return (
    <label className="space-y-1.5 text-sm">
      <span className="font-semibold text-foreground">{label}</span>
      <select
        className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      >
        <option value="">Select period</option>
        {options.map((item) => (
          <option key={item.id} value={item.id}>
            {item.cycleName} ({item.cycleYear})
          </option>
        ))}
      </select>
    </label>
  );
}

function PeriodSummary({
  label,
  evaluation,
  onOpenDocument,
}: {
  label: string;
  evaluation: HistoryEvaluation | null;
  onOpenDocument?: (evaluationId: string, mode: "preview" | "print" | "export") => void;
}) {
  if (!evaluation)
    return (
      <Card>
        <CardContent className="p-4 text-sm text-muted-foreground">
          {label}: no period selected.
        </CardContent>
      </Card>
    );
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm">
          {label}: {evaluation.cycleName} ({evaluation.cycleYear})
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <div className="flex items-center justify-between gap-2">
          <EvaluationStatusBadge status={evaluation.status as EvaluationStatus} />
          <span className="text-xs text-muted-foreground">
            {evaluation.jobTitle} · {evaluation.division}
          </span>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Info label="Self average" value={formatScore(evaluation.scores?.employeeAverage)} />
          <Info label="Rater average" value={formatScore(evaluation.scores?.supervisorAverage)} />
          <Info label="Final score" value={formatScore(evaluation.scores?.finalScore)} />
          <Info label="Final rating" value={evaluation.scores?.finalRatingLabel ?? "—"} />
        </div>
        {evaluation.status === "FINALIZED" && onOpenDocument ? (
          <Button
            variant="outline"
            size="sm"
            onClick={() => onOpenDocument(evaluation.id, "preview")}
          >
            Open final document
          </Button>
        ) : null}
      </CardContent>
    </Card>
  );
}

function ratingFor(
  evaluation: HistoryEvaluation | null,
  criterionId: string,
  evaluatorType: string,
) {
  return (
    evaluation?.ratings.find(
      (rating) => rating.criterionId === criterionId && rating.evaluatorType === evaluatorType,
    )?.rating ?? null
  );
}

function ratingSummary(evaluation: HistoryEvaluation | null, criterionId: string) {
  const self = ratingFor(evaluation, criterionId, "EMPLOYEE");
  const supervisor = ratingFor(evaluation, criterionId, "SUPERVISOR");
  const reviewing = ratingFor(evaluation, criterionId, "REVIEWING_SUPERVISOR");
  return `Self ${self ?? "—"} · Rater ${supervisor ?? "—"} · Review ${reviewing ?? "—"}`;
}

function formatScore(value: number | null | undefined) {
  return value === null || value === undefined ? "—" : Number(value).toFixed(2);
}
