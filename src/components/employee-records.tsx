import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
  const [historyPage, setHistoryPage] = useState(0);
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
    queryKey: [
      "digital-201-file",
      selected,
      selectedEvaluationId,
      comparisonEvaluationId,
      historyPage,
    ],
    queryFn: () =>
      fetch201File({
        data: {
          employeeId: selected as string,
          selectedEvaluationId,
          comparisonEvaluationId,
          page: historyPage,
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
                          setHistoryPage(0);
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

      <Sheet
        open={selected !== null}
        onOpenChange={(open) => {
          if (!open) {
            setSelected(null);
            setSelectedEvaluationId(null);
            setComparisonEvaluationId(null);
            setHistoryPage(0);
          }
        }}
      >
        <SheetContent className="w-full overflow-y-auto sm:max-w-6xl">
          <SheetHeader>
            <SheetTitle>{detailQuery.data?.employee.full_name ?? "Digital 201 File"}</SheetTitle>
            <SheetDescription>
              Secure employee record, evaluation history, and period comparison.
            </SheetDescription>
          </SheetHeader>
          <div className="space-y-4 px-4 pb-6">
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
              <Digital201History
                history={(detailQuery.data?.history ?? []) as unknown as HistoryEvaluation[]}
                selected={
                  (detailQuery.data?.selected ?? null) as unknown as HistoryEvaluation | null
                }
                comparison={
                  (detailQuery.data?.comparison ?? null) as unknown as HistoryEvaluation | null
                }
                selectedEvaluationId={
                  selectedEvaluationId ?? detailQuery.data?.selected?.id ?? null
                }
                comparisonEvaluationId={
                  comparisonEvaluationId ?? detailQuery.data?.comparison?.id ?? null
                }
                historyPage={historyPage}
                totalCount={detailQuery.data?.totalCount ?? 0}
                onSelectedChange={setSelectedEvaluationId}
                onComparisonChange={setComparisonEvaluationId}
                onPageChange={setHistoryPage}
                onOpenDocument={openFinalEvaluationDocument}
              />
            )}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Employee file</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <FileCategory
                  label="Performance Evaluations"
                  count={
                    (detailQuery.data?.history ?? []).filter((item) => item.status === "FINALIZED")
                      .length
                  }
                />
                <FileCategory label="Awards and Recognition" />
                <FileCategory label="Training and Certificates" />
                <FileCategory label="Supporting Documents" />
                <FileCategory label="Other Documents" />
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Employee documents</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex flex-wrap gap-2">
                  <select
                    className="h-10 rounded-md border border-input bg-background px-3 text-sm"
                    value={documentCategory}
                    onChange={(event) => setDocumentCategory(event.target.value)}
                    aria-label="Document category"
                  >
                    <option value="AWARDS_RECOGNITION">Awards and Recognition</option>
                    <option value="TRAINING_CERTIFICATES">Training and Certificates</option>
                    <option value="SUPPORTING_DOCUMENTS">Supporting Documents</option>
                    <option value="OTHER_DOCUMENTS">Other Documents</option>
                  </select>
                  <input
                    ref={fileInput}
                    type="file"
                    className="max-w-full text-sm"
                    disabled={uploading}
                    onChange={(event) =>
                      event.target.files?.[0] && handleUpload(event.target.files[0])
                    }
                  />
                </div>
                {documentsQuery.isLoading ? (
                  <LoadingBlock rows={2} />
                ) : (
                  (documentsQuery.data ?? []).map((document) => (
                    <button
                      key={document.id}
                      type="button"
                      className="flex w-full items-center justify-between rounded-md border border-border px-3 py-2 text-left text-sm hover:bg-accent"
                      onClick={() => openDocument(document.id)}
                    >
                      <span>{document.file_name}</span>
                      <span className="text-xs text-muted-foreground">
                        {document.category.replaceAll("_", " ")}
                      </span>
                    </button>
                  ))
                )}
              </CardContent>
            </Card>
          </div>
        </SheetContent>
      </Sheet>

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

function Digital201History({
  history,
  selected,
  comparison,
  selectedEvaluationId,
  comparisonEvaluationId,
  historyPage,
  totalCount,
  onSelectedChange,
  onComparisonChange,
  onPageChange,
  onOpenDocument,
}: {
  history: HistoryEvaluation[];
  selected: HistoryEvaluation | null;
  comparison: HistoryEvaluation | null;
  selectedEvaluationId: string | null;
  comparisonEvaluationId: string | null;
  historyPage: number;
  totalCount: number;
  onSelectedChange: (value: string) => void;
  onComparisonChange: (value: string) => void;
  onPageChange: (value: number) => void;
  onOpenDocument: (evaluationId: string, mode: "preview" | "print" | "export") => void;
}) {
  const criteria = Array.from(
    new Map(
      [...(selected?.ratings ?? []), ...(comparison?.ratings ?? [])]
        .filter((rating) => rating.criterion)
        .map((rating) => [rating.criterionId, rating.criterion]),
    ).values(),
  ).sort((first, second) => (first?.position ?? 0) - (second?.position ?? 0));

  return (
    <div className="space-y-5">
      <div className="grid gap-3 rounded-lg border border-border bg-muted/30 p-4 md:grid-cols-2">
        <PeriodSelect
          label="Selected evaluation period"
          value={selectedEvaluationId ?? ""}
          options={history}
          onChange={onSelectedChange}
        />
        <PeriodSelect
          label="Comparison period"
          value={comparisonEvaluationId ?? ""}
          options={history}
          onChange={onComparisonChange}
        />
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <PeriodSummary
          label="Selected period"
          evaluation={selected}
          onOpenDocument={onOpenDocument}
        />
        <PeriodSummary
          label="Comparison period"
          evaluation={comparison}
          onOpenDocument={onOpenDocument}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">A–J trend comparison</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto p-0">
          {criteria.length === 0 ? (
            <p className="p-4 text-sm text-muted-foreground">
              No criterion ratings are available for these periods.
            </p>
          ) : (
            <table className="w-full min-w-[720px] text-left text-sm">
              <caption className="sr-only">A–J evaluation trend comparison</caption>
              <thead className="border-b border-border bg-muted/50">
                <tr>
                  <th className="px-4 py-3 font-semibold">Criterion</th>
                  <th className="px-4 py-3 font-semibold">Selected</th>
                  <th className="px-4 py-3 font-semibold">Comparison</th>
                  <th className="px-4 py-3 font-semibold">Trend</th>
                </tr>
              </thead>
              <tbody>
                {criteria.map((criterion) => {
                  const selectedScore = ratingFor(selected, criterion?.id ?? "", "SUPERVISOR");
                  const comparisonScore = ratingFor(comparison, criterion?.id ?? "", "SUPERVISOR");
                  const difference =
                    selectedScore !== null && comparisonScore !== null
                      ? selectedScore - comparisonScore
                      : null;
                  return (
                    <tr key={criterion?.id} className="border-b border-border last:border-0">
                      <td className="px-4 py-3">
                        <span className="font-semibold">{criterion?.letter}</span>
                        <span className="ml-2 text-muted-foreground">{criterion?.title}</span>
                      </td>
                      <td className="px-4 py-3 tabular-nums">
                        {ratingSummary(selected, criterion?.id ?? "")}
                      </td>
                      <td className="px-4 py-3 tabular-nums">
                        {ratingSummary(comparison, criterion?.id ?? "")}
                      </td>
                      <td className="px-4 py-3 font-semibold">
                        {difference === null
                          ? "—"
                          : difference > 0
                            ? `↑ +${difference}`
                            : difference < 0
                              ? `↓ ${difference}`
                              : "→ 0"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      <div className="rounded-lg border border-border bg-card p-3 text-xs text-muted-foreground">
        Trend values compare the Immediate Supervisor / Rater score for each factor. Self and
        Reviewing Supervisor scores remain visible in each period cell for audit context.
      </div>

      <div className="space-y-2">
        <h3 className="text-sm font-semibold">Historical evaluation records</h3>
        {history.map((item) => (
          <div key={item.id} className="rounded-lg border border-border p-3 text-sm">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="font-medium">
                {item.cycleName} ({item.cycleYear})
              </span>
              <EvaluationStatusBadge status={item.status as EvaluationStatus} />
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              {item.jobTitle} · {item.division}
              {item.section ? ` · ${item.section}` : ""}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Submitted {formatDateTime(item.employeeSubmittedAt)} · Finalized{" "}
              {formatDateTime(item.finalizedAt)}
            </p>
          </div>
        ))}
        {totalCount > history.length ? (
          <div className="flex items-center justify-between gap-3 pt-2">
            <span className="text-xs text-muted-foreground">
              Showing {historyPage * 25 + 1}–{Math.min((historyPage + 1) * 25, totalCount)} of{" "}
              {totalCount}
            </span>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={historyPage === 0}
                onClick={() => onPageChange(historyPage - 1)}
              >
                Previous
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={(historyPage + 1) * 25 >= totalCount}
                onClick={() => onPageChange(historyPage + 1)}
              >
                Next
              </Button>
            </div>
          </div>
        ) : null}
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
  onOpenDocument: (evaluationId: string, mode: "preview" | "print" | "export") => void;
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
        {evaluation.status === "FINALIZED" ? (
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
