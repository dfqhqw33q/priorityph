import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState, EvaluationStatusBadge, LoadingBlock, PageHeader, formatDateTime } from "@/components/ui-bits";
import { getEvaluationHistory } from "@/lib/reports.functions";
import { humanizeToken } from "@/lib/domain";
import { getEvaluationDocumentUrl } from "@/lib/documents.functions";

export const Route = createFileRoute("/_authenticated/hr/evaluation-history/$evaluationId")({
  component: HistoryDetailPage,
});

function HistoryDetailPage() {
  const { evaluationId } = Route.useParams();
  const fetch = useServerFn(getEvaluationHistory);
  const getDocumentUrl = useServerFn(getEvaluationDocumentUrl);
  const [documentAction, setDocumentAction] = useState<"preview" | "print" | null>(null);
  const query = useQuery({
    queryKey: ["evaluation-history-detail", evaluationId],
    queryFn: () => fetch({ data: { evaluationId } }),
    retry: false,
  });

  async function openFinalDocument(mode: "preview" | "print") {
    setDocumentAction(mode);
    try {
      const result = await getDocumentUrl({ data: { evaluationId } });
      const win = window.open(result.url, "_blank", "noopener,noreferrer");
      if (mode === "print") {
        setTimeout(() => win?.print(), 600);
      }
    } catch (error) {
      window.alert(error instanceof Error ? error.message : "The final evaluation document is not available yet.");
    } finally {
      setDocumentAction(null);
    }
  }

  if (query.isLoading) return <LoadingBlock rows={8} />;
  if (query.isError || !query.data?.detail)
    return (
      <EmptyState
        title="This evaluation could not be opened"
        description={query.isError ? (query.error as Error).message : "Evaluation not found."}
      />
    );

  const { detail, score, events, auditTrail } = query.data;

  return (
    <div className="space-y-6">
      <PageHeader
        title={detail.full_name_snapshot}
        description={`${detail.cycle_name} (${detail.cycle_year}) · ${detail.employee_number_snapshot}`}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <EvaluationStatusBadge status={detail.status} />
            {detail.status === "FINALIZED" ? (
              <>
                <Button variant="outline" size="sm" onClick={() => openFinalDocument("preview")} disabled={documentAction !== null}>
                  {documentAction === "preview" ? "Opening..." : "Preview"}
                </Button>
                <Button variant="outline" size="sm" onClick={() => openFinalDocument("print")} disabled={documentAction !== null}>
                  {documentAction === "print" ? "Opening..." : "Print"}
                </Button>
              </>
            ) : null}
          </div>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Info label="Self-assessment submitted" value={formatDateTime(detail.employee_submitted_at)} />
        <Info label="Supervisor review submitted" value={formatDateTime(detail.supervisor_submitted_at)} />
        <Info label="Finalized" value={formatDateTime(detail.finalized_at)} />
        <Info label="Final rating" value={score?.finalRatingLabel ?? "—"} />
      </div>

      <Card className="border border-border bg-card shadow-sm">
        <CardHeader>
          <CardTitle className="text-base font-bold">Employee information</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 text-sm sm:grid-cols-2 lg:grid-cols-3">
          <Info label="Employee number" value={detail.employee_number_snapshot} />
          <Info label="Full name" value={detail.full_name_snapshot} />
          <Info label="Job title" value={detail.job_title_snapshot} />
          <Info label="Division / department" value={detail.division_snapshot} />
          <Info label="Section / unit" value={detail.section_snapshot} />
          <Info label="Supervisor" value={detail.supervisor_name ?? "—"} />
        </CardContent>
      </Card>

      <Card className="border border-border bg-card shadow-sm">
        <CardHeader>
          <CardTitle className="text-base font-bold">Scores</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 text-sm sm:grid-cols-3">
          <Info label="Employee self-rating average" value={String(score?.employeeAverage ?? "—")} />
          <Info label="Supervisor rating average" value={String(score?.supervisorAverage ?? "—")} />
          <Info label="Final score" value={String(score?.finalScore ?? "—")} />
          <Info label="Scoring version" value={score?.ruleVersion ? String(score.ruleVersion) : "—"} />
        </CardContent>
      </Card>

      <Card className="border border-border bg-card shadow-sm">
        <CardHeader>
          <CardTitle className="text-base font-bold">Evaluation progress</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {events.length === 0 ? (
            <p className="text-sm text-muted-foreground">No progress recorded yet.</p>
          ) : (
            events.map((event) => (
              <div key={event.id} className="border-b border-border pb-3 text-sm last:border-0 last:pb-0">
                <p className="font-semibold text-foreground">
                  {humanizeToken(event.event_type)} · {event.actorName}
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {formatDateTime(event.occurred_at)}
                  {event.reason ? ` · ${event.reason}` : ""}
                </p>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      <Card className="border border-border bg-card shadow-sm">
        <CardHeader>
          <CardTitle className="text-base font-bold">Activity history</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {auditTrail.length === 0 ? (
            <p className="text-sm text-muted-foreground">No activity recorded yet.</p>
          ) : (
            auditTrail.map((event) => (
              <div key={event.id} className="border-b border-border pb-3 text-sm last:border-0 last:pb-0">
                <p className="font-semibold text-foreground">
                  {humanizeToken(event.action)} · {event.module}
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {formatDateTime(event.occurred_at)}
                  {event.reason ? ` · ${event.reason}` : ""}
                </p>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      <div>
        <Link className="text-sm font-medium text-primary hover:underline" to="/hr/evaluation-history">
          ← Back to evaluation history
        </Link>
      </div>
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
