import { Link } from "@tanstack/react-router";

import { EmptyState, StatusBadge } from "@/components/shared/portal-ui";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { SupervisorEvaluation } from "@/lib/portal.functions";

export function SupervisorEvaluationList({
  evaluations,
  emptyTitle,
  emptyDescription,
}: {
  evaluations: SupervisorEvaluation[];
  emptyTitle: string;
  emptyDescription: string;
}) {
  if (!evaluations.length) return <EmptyState title={emptyTitle} description={emptyDescription} />;

  return (
    <div className="overflow-x-auto rounded-xl border border-border bg-card">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Employee ID</TableHead>
            <TableHead>Employee</TableHead>
            <TableHead>Position</TableHead>
            <TableHead>Evaluation period</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Submitted</TableHead>
            <TableHead className="text-right">Self score</TableHead>
            <TableHead>Supervisor review</TableHead>
            <TableHead>
              <span className="sr-only">Action</span>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {evaluations.map((evaluation) => (
            <TableRow key={evaluation.id}>
              <TableCell className="font-medium">{evaluation.employeeNumber}</TableCell>
              <TableCell>
                <div>{evaluation.employeeName}</div>
                <div className="text-xs text-muted-foreground">{evaluation.department}</div>
              </TableCell>
              <TableCell>{evaluation.position}</TableCell>
              <TableCell>{evaluation.periodName}</TableCell>
              <TableCell>
                <StatusBadge>{evaluation.status.replaceAll("_", " ")}</StatusBadge>
              </TableCell>
              <TableCell>
                {evaluation.submittedAt
                  ? new Date(evaluation.submittedAt).toLocaleDateString()
                  : "Not submitted"}
              </TableCell>
              <TableCell className="text-right">
                {evaluation.employeeScore === null
                  ? "—"
                  : Number(evaluation.employeeScore).toFixed(2)}
              </TableCell>
              <TableCell>
                {evaluation.supervisorStatus
                  ? evaluation.supervisorStatus.replaceAll("_", " ")
                  : "Not started"}
              </TableCell>
              <TableCell className="text-right">
                {[
                  "SUBMITTED",
                  "PENDING_SUPERVISOR_REVIEW",
                  "SUPERVISOR_IN_PROGRESS",
                  "SUPERVISOR_SUBMITTED",
                  "COMPLETED",
                ].includes(evaluation.status) ? (
                  <Button asChild size="sm" variant="outline">
                    <Link
                      to="/team/evaluations/$evaluationId"
                      params={{ evaluationId: evaluation.id }}
                    >
                      {evaluation.supervisorStatus === "SUBMITTED" ||
                      evaluation.supervisorStatus === "COMPLETED" ||
                      evaluation.status === "COMPLETED"
                        ? "View review"
                        : "Open review"}
                    </Link>
                  </Button>
                ) : (
                  <span className="text-xs text-muted-foreground">Awaiting employee</span>
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
