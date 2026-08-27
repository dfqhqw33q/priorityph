import { useState, type ReactNode } from "react";

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
import { EVALUATION_STATUS_LABELS, type EvaluationStatus, type CycleStatus } from "@/lib/domain";
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

export function StatCard({ label, value, hint }: { label: string; value: ReactNode; hint?: string }) {
  return (
    <Card className="border border-border bg-card shadow-sm transition-shadow hover:shadow-md">
      <CardContent className="pt-6">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{label}</p>
        <p className="mt-2 text-3xl font-bold tabular-nums text-foreground">{value}</p>
        {hint ? <p className="mt-1.5 text-xs text-muted-foreground">{hint}</p> : null}
      </CardContent>
    </Card>
  );
}

export function EmptyState({ title, description }: { title: string; description?: string }) {
  return (
    <div className="rounded-xl border border-dashed border-border bg-card/40 px-6 py-12 text-center">
      <p className="text-sm font-semibold text-foreground">{title}</p>
      {description ? <p className="mt-1.5 text-xs text-muted-foreground">{description}</p> : null}
    </div>
  );
}

export function LoadingBlock({ rows = 4 }: { rows?: number }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: rows }).map((_, index) => (
        <Skeleton key={index} className="h-12 w-full rounded-lg" />
      ))}
    </div>
  );
}

const CYCLE_VARIANTS: Record<CycleStatus, string> = {
  DRAFT: "border-border bg-muted/60 text-muted-foreground",
  ACTIVE: "border-emerald-500/20 bg-emerald-500/10 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300 font-semibold",
  CLOSED: "border-amber-500/20 bg-amber-500/10 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300 font-semibold",
  DISABLED: "border-destructive/20 bg-destructive/10 text-destructive dark:bg-destructive/20 dark:text-red-400 font-semibold",
};

export function CycleStatusBadge({ status }: { status: CycleStatus }) {
  return (
    <Badge variant="outline" className={cn("px-2.5 py-0.5 text-xs", CYCLE_VARIANTS[status])}>
      {status.charAt(0) + status.slice(1).toLowerCase()}
    </Badge>
  );
}

const EVAL_VARIANTS: Record<EvaluationStatus, string> = {
  EMPLOYEE_SUBMITTED: "border-sky-500/20 bg-sky-500/10 text-sky-700 dark:bg-sky-500/20 dark:text-sky-300 font-medium",
  SUPERVISOR_DRAFT: "border-border bg-muted/60 text-muted-foreground font-medium",
  SUPERVISOR_SUBMITTED: "border-blue-500/20 bg-blue-500/10 text-blue-700 dark:bg-blue-500/20 dark:text-blue-300 font-medium",
  PRESIDENT_REVIEW: "border-purple-500/20 bg-purple-500/10 text-purple-700 dark:bg-purple-500/20 dark:text-purple-300 font-medium",
  PRESIDENT_SUBMITTED: "border-fuchsia-500/20 bg-fuchsia-500/10 text-fuchsia-700 dark:bg-fuchsia-500/20 dark:text-fuchsia-300 font-medium",
  READY_FOR_FINALIZATION: "border-amber-500/20 bg-amber-500/10 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300 font-medium",
  RETURNED_FOR_CORRECTION: "border-rose-500/20 bg-rose-500/10 text-rose-700 dark:bg-rose-500/20 dark:text-rose-300 font-medium",
  FINALIZED: "border-emerald-500/20 bg-emerald-500/10 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300 font-medium",
};

export function EvaluationStatusBadge({ status }: { status: EvaluationStatus }) {
  return (
    <Badge variant="outline" className={cn("px-2.5 py-0.5 text-xs", EVAL_VARIANTS[status])}>
      {EVALUATION_STATUS_LABELS[status]}
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
          {description ? <DialogDescription className="text-muted-foreground">{description}</DialogDescription> : null}
        </DialogHeader>
        <div className="space-y-2">
          <Label htmlFor="reason" className="text-foreground">Reason (recorded in the audit log)</Label>
          <Textarea
            id="reason"
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder="Briefly explain why you are making this change"
            rows={3}
            className="border-input bg-background text-foreground"
          />
          {tooShort ? <p className="text-xs text-muted-foreground">At least 5 characters.</p> : null}
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
