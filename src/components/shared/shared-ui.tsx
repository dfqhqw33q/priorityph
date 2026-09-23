import { useState, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  EVALUATION_STATUS_LABELS,
  humanizeToken,
  type EvaluationStatus,
  type CycleStatus,
} from "@/lib/domain";
import { cn } from "@/lib/utils";

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3 border-b border-border pb-5 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">{title}</h1>
        {description ? <p className="mt-1 text-sm text-muted-foreground">{description}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}

export function StatCard({
  label,
  value,
  hint,
  to,
}: {
  label: string;
  value: ReactNode;
  hint?: string;
  to?: string;
}) {
  const content = (
    <Card className="h-full border border-border bg-card shadow-sm transition-all hover:shadow-md">
      <CardContent className="pt-6">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          {label}
        </p>
        <p className="mt-2 text-3xl font-bold tabular-nums text-foreground">{value}</p>
        {hint ? <p className="mt-1.5 text-xs text-muted-foreground">{hint}</p> : null}
      </CardContent>
    </Card>
  );

  if (!to) return content;

  return (
    <Link
      to={to}
      className="block focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
    >
      {content}
    </Link>
  );
}

export function EmptyState({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children?: ReactNode;
}) {
  return (
    <div
      className="rounded-xl border border-dashed border-border bg-card/40 px-6 py-12 text-center"
      role="status"
      aria-live="polite"
    >
      <p className="text-sm font-semibold text-foreground">{title}</p>
      {description ? <p className="mt-1.5 text-xs text-muted-foreground">{description}</p> : null}
      {children}
    </div>
  );
}

export type AuditActivityRow = {
  id: string;
  action: string;
  performed_by: string;
  performed_by_role: string;
  employee_name: string;
  occurred_at: string;
};

const AUDIT_ACTIVITY_LABELS: Record<string, string> = {
  STEP1_SUBMITTED: "Evaluation submitted",
  EMPLOYEE_STEP1_SUBMITTED: "Evaluation submitted",
  RATER_STEP2_SUBMITTED: "Supervisor review submitted",
  REVIEWING_SUPERVISOR_REVIEW_STARTED: "Review started",
  REVIEWING_SUPERVISOR_SUBMITTED: "Reviewing Supervisor review submitted",
  PERSONNEL_SUBMITTED: "Personnel processing submitted",
  COMMITTEE_SUBMITTED: "Committee action submitted",
  PRESIDENT_APPROVED: "Evaluation finalized",
  PRESIDENT_RETURNED: "Evaluation returned",
  EVALUATION_RESUBMITTED: "Evaluation resubmitted",
  FINALIZED: "Evaluation finalized",
};

export function auditActivityLabel(action: string) {
  return (
    AUDIT_ACTIVITY_LABELS[action] ?? humanizeToken(action).replace(/^Evaluation Workflow /i, "")
  );
}

export function AuditActivityTable({ rows }: { rows: AuditActivityRow[] }) {
  if (rows.length === 0) {
    return (
      <div className="flex min-h-[80px] items-center justify-center rounded-md border border-dashed border-border bg-muted/20 px-3 py-4 text-center">
        <p className="text-sm text-muted-foreground">No recent evaluation activity.</p>
      </div>
    );
  }

  return (
    <div className="max-w-full overflow-hidden border border-border bg-card shadow-sm">
      <Table className="!w-full !min-w-0 table-fixed">
        <caption className="sr-only">Recent evaluation activity</caption>
        <TableHeader>
          <TableRow>
            <TableHead className="w-[30%]">Activity</TableHead>
            <TableHead className="w-[21%]">Performed By</TableHead>
            <TableHead className="w-[14%]">Role</TableHead>
            <TableHead className="w-[17%]">Employee</TableHead>
            <TableHead className="w-[18%] whitespace-normal">Date &amp; Time</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => (
            <TableRow key={row.id}>
              <TableCell className="whitespace-normal break-words font-medium">
                {auditActivityLabel(row.action)}
              </TableCell>
              <TableCell className="whitespace-normal break-words">{row.performed_by}</TableCell>
              <TableCell className="whitespace-normal break-words">
                {humanizeToken(row.performed_by_role)}
              </TableCell>
              <TableCell className="whitespace-normal break-words">{row.employee_name}</TableCell>
              <TableCell className="whitespace-normal break-words">
                {formatDateTime(row.occurred_at)}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

export function DashboardSummaryLayout({ status }: { status: ReactNode }) {
  return <div className="min-w-0">{status}</div>;
}

export function ChartDataSummary({
  title,
  items,
}: {
  title: string;
  items: Array<{ label: string; value: number }>;
}) {
  return (
    <div className="sr-only">
      <h3>{title}</h3>
      <ul>
        {items.map((item) => (
          <li key={item.label}>
            {item.label}: {item.value}
          </li>
        ))}
      </ul>
    </div>
  );
}

export function LoadingBlock({
  rows = 4,
  variant = "table",
}: {
  rows?: number;
  variant?: "table" | "cards" | "detail";
}) {
  if (variant === "cards") {
    return (
      <div
        className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"
        role="status"
        aria-live="polite"
        aria-label="Loading"
      >
        {Array.from({ length: Math.max(rows, 4) }).map((_, index) => (
          <div key={index} className="rounded-xl border border-border bg-card p-6 shadow-sm">
            <Skeleton className="h-3 w-28" />
            <Skeleton className="mt-3 h-9 w-20" />
            <Skeleton className="mt-2 h-3 w-32" />
          </div>
        ))}
      </div>
    );
  }

  if (variant === "detail") {
    return (
      <div className="space-y-6" role="status" aria-live="polite" aria-label="Loading">
        {Array.from({ length: Math.max(2, Math.ceil(rows / 4)) }).map((_, index) => (
          <div key={index} className="rounded-xl border border-border bg-card p-6 shadow-sm">
            <Skeleton className="h-5 w-48" />
            <Skeleton className="mt-2 h-3 w-72 max-w-full" />
            <div className="mt-6 grid gap-5 sm:grid-cols-2">
              {Array.from({ length: 4 }).map((__, fieldIndex) => (
                <div key={fieldIndex} className="space-y-2">
                  <Skeleton className="h-3 w-24" />
                  <Skeleton className="h-10 w-full rounded-md" />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div
      className="overflow-hidden rounded-xl border border-border bg-card shadow-sm"
      role="status"
      aria-live="polite"
      aria-label="Loading"
    >
      <div className="grid grid-cols-2 gap-4 border-b border-border bg-muted/40 px-4 py-3 sm:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <Skeleton key={index} className={cn("h-3", index === 1 ? "w-32" : "w-20")} />
        ))}
      </div>
      <div>
        {Array.from({ length: rows }).map((_, rowIndex) => (
          <div
            key={rowIndex}
            className="grid grid-cols-2 gap-4 border-b border-border px-4 py-4 last:border-0 sm:grid-cols-4"
          >
            <Skeleton className="h-4 w-32 max-w-full" />
            <Skeleton className="h-4 w-40 max-w-full" />
            <Skeleton className="h-4 w-24 max-w-full" />
            <Skeleton className="h-4 w-20 max-w-full" />
          </div>
        ))}
      </div>
    </div>
  );
}

const CYCLE_VARIANTS: Record<CycleStatus, string> = {
  DRAFT: "border-border bg-muted/60 text-muted-foreground",
  ACTIVE:
    "border-emerald-500/20 bg-emerald-500/10 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300 font-semibold",
  CLOSED:
    "border-amber-500/20 bg-amber-500/10 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300 font-semibold",
  DISABLED:
    "border-destructive/20 bg-destructive/10 text-destructive dark:bg-destructive/20 dark:text-red-400 font-semibold",
};

export function CycleStatusBadge({ status }: { status: CycleStatus }) {
  return (
    <Badge variant="outline" className={cn("px-2.5 py-0.5 text-xs", CYCLE_VARIANTS[status])}>
      {status === "DISABLED" ? "Archived" : status.charAt(0) + status.slice(1).toLowerCase()}
    </Badge>
  );
}

const EVAL_VARIANTS: Record<EvaluationStatus, string> = {
  DRAFT: "border-border bg-muted/60 text-muted-foreground font-medium",
  SUBMITTED:
    "border-sky-500/20 bg-sky-500/10 text-sky-700 dark:bg-sky-500/20 dark:text-sky-300 font-medium",
  FOR_REVIEW:
    "border-violet-500/20 bg-violet-500/10 text-violet-700 dark:bg-violet-500/20 dark:text-violet-300 font-medium",
  FOR_PROCESSING:
    "border-cyan-500/20 bg-cyan-500/10 text-cyan-700 dark:bg-cyan-500/20 dark:text-cyan-300 font-medium",
  FOR_APPROVAL:
    "border-fuchsia-500/20 bg-fuchsia-500/10 text-fuchsia-700 dark:bg-fuchsia-500/20 dark:text-fuchsia-300 font-medium",
  RETURNED:
    "border-rose-500/20 bg-rose-500/10 text-rose-700 dark:bg-rose-500/20 dark:text-rose-300 font-medium",
  FINALIZED:
    "border-emerald-500/20 bg-emerald-500/10 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300 font-medium",
};

export function EvaluationStatusBadge({ status }: { status: EvaluationStatus }) {
  return (
    <Badge variant="outline" className={cn("px-2.5 py-0.5 text-xs", EVAL_VARIANTS[status])}>
      {EVALUATION_STATUS_LABELS[status] ?? humanizeToken(status)}
    </Badge>
  );
}

export function ReasonDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = "Confirm",
  destructive,
  pending,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string | undefined;
  confirmLabel?: string | undefined;
  destructive?: boolean | undefined;
  pending?: boolean | undefined;
  onConfirm: (reason: string) => void;
}) {
  const [reason, setReason] = useState("");
  const tooShort = reason.trim().length < 5;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) setReason("");
        onOpenChange(next);
      }}
    >
      <DialogContent className="border-border bg-popover text-popover-foreground">
        <DialogHeader>
          <DialogTitle className="text-foreground">{title}</DialogTitle>
          {description ? (
            <DialogDescription className="text-muted-foreground">{description}</DialogDescription>
          ) : null}
        </DialogHeader>
        <div className="space-y-2">
          <Label htmlFor="reason" className="text-foreground">
            Reason (recorded in the audit log)
          </Label>
          <Textarea
            id="reason"
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder="Briefly explain why you are making this change"
            rows={3}
            className="border-input bg-background text-foreground"
          />
          {tooShort ? (
            <p className="text-xs text-muted-foreground">At least 5 characters.</p>
          ) : null}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            variant={destructive ? "destructive" : "default"}
            disabled={tooShort || pending}
            onClick={() => onConfirm(reason.trim())}
          >
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function formatDateTime(value: string | null | undefined) {
  if (!value) return "—";
  return new Date(value).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

export function formatCompactDateTime(value: string | null | undefined) {
  if (!value) return "—";
  return new Date(value).toLocaleString(undefined, {
    dateStyle: "short",
    timeStyle: "short",
  });
}

export function formatCompactDateTimeParts(value: string | null | undefined) {
  if (!value) return ["—"];
  const date = new Date(value);
  return [
    date.toLocaleDateString(undefined, { dateStyle: "short" }),
    date.toLocaleTimeString(undefined, { timeStyle: "short" }),
  ];
}
