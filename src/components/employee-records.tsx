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
import { getEmployeeRecord, listEmployees } from "@/lib/admin.functions";
import { getEvaluationDocumentUrl, getEmployeeDocumentUrl, listEmployeeDocuments, uploadEmployeeDocument, getEvaluationSheetHtml } from "@/lib/documents.functions";
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

export function EmployeeRecordsPage() {
  const fetchEmployees = useServerFn(listEmployees);
  const fetchRecord = useServerFn(getEmployeeRecord);
  const fetchDocuments = useServerFn(listEmployeeDocuments);
  const getDocumentUrl = useServerFn(getEmployeeDocumentUrl);
  const getFinalEvaluationDocumentUrl = useServerFn(getEvaluationDocumentUrl);
  const getSheetHtml = useServerFn(getEvaluationSheetHtml);
  const uploadDocument = useServerFn(uploadEmployeeDocument);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
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
    queryKey: ["employee-record", selected],
    queryFn: () => fetchRecord({ data: { employeeId: selected as string } }),
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
      await uploadDocument({ data: { employeeId: selected, category: documentCategory as never, fileName: file.name, contentType: file.type, contentBase64: btoa(binary) } });
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

  async function openFinalEvaluationDocument(evaluationId: string, mode: "preview" | "print" | "export") {
    setDocumentOpen(true);
    try {
      const result = await getSheetHtml({ data: { evaluationId } });
      setDocumentHtml(result.html);
      
      // Handle print/export after document loads
      if (mode === "print") {
        setTimeout(() => {
          const frame = document.querySelector('iframe[title="Evaluation document preview"]') as HTMLIFrameElement;
          frame?.contentWindow?.print();
        }, 600);
      } else if (mode === "export") {
        // For export, user can use browser's Print to PDF
        setTimeout(() => {
          const frame = document.querySelector('iframe[title="Evaluation document preview"]') as HTMLIFrameElement;
          frame?.focus();
        }, 300);
      }
    } catch (error) {
      setDocumentOpen(false);
      toast.error(error instanceof Error ? error.message : "The final evaluation document is not available yet.");
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
        <EmptyState title="No employee records yet" description="Records appear once employees submit their self-assessments." />
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
                    <Button variant="outline" size="sm" onClick={() => setSelected(row.id)}>
                      History
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <Sheet open={selected !== null} onOpenChange={(open) => !open && setSelected(null)}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
          <SheetHeader>
            <SheetTitle>{detailQuery.data?.employee.full_name ?? "Employee record"}</SheetTitle>
            <SheetDescription>Evaluation history across all cycles.</SheetDescription>
          </SheetHeader>
          <div className="space-y-4 px-4 pb-6">
            {detailQuery.isLoading ? (
              <LoadingBlock rows={3} />
            ) : (detailQuery.data?.history ?? []).length === 0 ? (
              <p className="text-sm text-muted-foreground">No evaluations recorded yet.</p>
            ) : (
              (detailQuery.data?.history ?? []).map((item) => (
                <div key={item.id} className="rounded-lg border border-border p-3 text-sm">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium">
                      {item.cycle_name} ({item.cycle_year})
                    </span>
                    <EvaluationStatusBadge status={item.status as EvaluationStatus} />
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {item.job_title_snapshot} · {item.division_snapshot}
                    {item.section_snapshot ? ` · ${item.section_snapshot}` : ""}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Self-assessment {formatDateTime(item.employee_submitted_at)} · Supervisor{" "}
                    {formatDateTime(item.supervisor_submitted_at)}
                  </p>
                  {item.status === "FINALIZED" ? (
                    <div className="mt-3 flex flex-wrap gap-2">
                      <Button variant="outline" size="sm" onClick={() => openFinalEvaluationDocument(item.id, "preview")}>
                        Preview
                      </Button>
                      <Button variant="outline" size="sm" onClick={() => openFinalEvaluationDocument(item.id, "print")}>
                        Print
                      </Button>
                      <Button variant="outline" size="sm" onClick={() => openFinalEvaluationDocument(item.id, "export")}>
                        Export
                      </Button>
                      <Button variant="secondary" size="sm" onClick={() => openFinalEvaluationDocument(item.id, "preview")}>
                        Refresh PDF
                      </Button>
                    </div>
                  ) : null}
                </div>
              ))
            )}
            <Card>
              <CardHeader><CardTitle className="text-base">Employee file</CardTitle></CardHeader>
              <CardContent className="space-y-2 text-sm">
                <FileCategory label="Performance Evaluations" count={(detailQuery.data?.history ?? []).filter((item) => item.status === "FINALIZED").length} />
                <FileCategory label="Awards and Recognition" />
                <FileCategory label="Training and Certificates" />
                <FileCategory label="Supporting Documents" />
                <FileCategory label="Other Documents" />
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle className="text-base">Employee documents</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                <div className="flex flex-wrap gap-2">
                  <select className="h-10 rounded-md border border-input bg-background px-3 text-sm" value={documentCategory} onChange={(event) => setDocumentCategory(event.target.value)} aria-label="Document category">
                    <option value="AWARDS_RECOGNITION">Awards and Recognition</option>
                    <option value="TRAINING_CERTIFICATES">Training and Certificates</option>
                    <option value="SUPPORTING_DOCUMENTS">Supporting Documents</option>
                    <option value="OTHER_DOCUMENTS">Other Documents</option>
                  </select>
                  <input ref={fileInput} type="file" className="max-w-full text-sm" disabled={uploading} onChange={(event) => event.target.files?.[0] && handleUpload(event.target.files[0])} />
                </div>
                {documentsQuery.isLoading ? <LoadingBlock rows={2} /> : (documentsQuery.data ?? []).map((document) => <button key={document.id} type="button" className="flex w-full items-center justify-between rounded-md border border-border px-3 py-2 text-left text-sm hover:bg-accent" onClick={() => openDocument(document.id)}><span>{document.file_name}</span><span className="text-xs text-muted-foreground">{document.category.replaceAll("_", " ")}</span></button>)}
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
  return <div className="flex items-center justify-between rounded-md border border-border px-3 py-2"><span>{label}</span><span className="text-xs text-muted-foreground">{count} records</span></div>;
}
