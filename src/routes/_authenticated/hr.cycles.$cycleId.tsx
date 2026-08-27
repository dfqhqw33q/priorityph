import { createFileRoute, useNavigate, useParams } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useRef, useState } from "react";
import QRCode from "qrcode";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  CycleStatusBadge,
  LoadingBlock,
  PageHeader,
  ReasonDialog,
  StatCard,
  formatDateTime,
} from "@/components/ui-bits";
import {
  changeCycleStatus,
  deleteDraftCycle,
  getCycle,
  regenerateCycleToken,
} from "@/lib/cycles.functions";
import { useAccess } from "@/hooks/use-access";
import type { CycleStatus } from "@/lib/domain";

export const Route = createFileRoute("/_authenticated/hr/cycles/$cycleId")({
  component: CycleDetailPage,
});

type Action =
  | { kind: "status"; status: CycleStatus; title: string; label: string; destructive?: boolean }
  | { kind: "regenerate" }
  | { kind: "delete" };

function CycleDetailPage() {
  const { cycleId } = useParams({ from: "/_authenticated/hr/cycles/$cycleId" });
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { can } = useAccess();
  const fetchCycle = useServerFn(getCycle);
  const setStatus = useServerFn(changeCycleStatus);
  const regenerate = useServerFn(regenerateCycleToken);
  const removeDraft = useServerFn(deleteDraftCycle);
  const [action, setAction] = useState<Action | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const { data: cycle, isLoading } = useQuery({
    queryKey: ["cycle", cycleId],
    queryFn: () => fetchCycle({ data: { cycleId } }),
  });

  const shareUrl =
    cycle?.cycle_token && typeof window !== "undefined"
      ? `${window.location.origin}/evaluation/${cycle.cycle_token}`
      : "";

  useEffect(() => {
    if (shareUrl && canvasRef.current) {
      QRCode.toCanvas(canvasRef.current, shareUrl, { width: 220, margin: 1 }).catch(() => undefined);
    }
  }, [shareUrl]);

  const mutation = useMutation({
    mutationFn: async (reason: string) => {
      if (!action) return;
      if (action.kind === "status") await setStatus({ data: { cycleId, status: action.status, reason } });
      else if (action.kind === "regenerate") await regenerate({ data: { cycleId, reason } });
      else await removeDraft({ data: { cycleId, reason } });
    },
    onSuccess: () => {
      const wasDelete = action?.kind === "delete";
      setAction(null);
      queryClient.invalidateQueries({ queryKey: ["cycle", cycleId] });
      queryClient.invalidateQueries({ queryKey: ["cycles"] });
      toast.success("Cycle updated");
      if (wasDelete) navigate({ to: "/hr/cycles" });
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Action failed"),
  });

  if (isLoading) return <LoadingBlock rows={6} />;
  if (!cycle) return <p className="text-sm text-muted-foreground">Cycle not found.</p>;

  const canManage = can("cycles.manage");
  const canLink = can("cycles.manage_link");

  function downloadQr() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const link = document.createElement("a");
    link.href = canvas.toDataURL("image/png");
    link.download = `evaluation-${cycle!.year}-qr.png`;
    link.click();
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={`${cycle.name} · ${cycle.year}`}
        description={`${formatDateTime(cycle.starts_at)} → ${formatDateTime(cycle.ends_at)}`}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <CycleStatusBadge status={cycle.status} />
            {canManage && cycle.status === "DRAFT" ? (
              <>
                <Button
                  onClick={() =>
                    setAction({ kind: "status", status: "ACTIVE", title: "Activate cycle", label: "Activate" })
                  }
                >
                  Activate
                </Button>
                <Button variant="outline" onClick={() => setAction({ kind: "delete" })}>
                  Delete draft
                </Button>
              </>
            ) : null}
            {canManage && cycle.status === "ACTIVE" ? (
              <Button
                variant="outline"
                onClick={() =>
                  setAction({ kind: "status", status: "CLOSED", title: "Close cycle early", label: "Close" })
                }
              >
                Close cycle
              </Button>
            ) : null}
            {canManage && cycle.status !== "DISABLED" ? (
              <Button
                variant="destructive"
                onClick={() =>
                  setAction({
                    kind: "status",
                    status: "DISABLED",
                    title: "Disable cycle",
                    label: "Disable",
                    destructive: true,
                  })
                }
              >
                Disable
              </Button>
            ) : null}
          </div>
        }
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Employee self-assessments" value={cycle.step1_count} />
        <StatCard label="Supervisor reviews submitted" value={cycle.supervisor_count} />
        <StatCard label="Waiting for the President" value={cycle.president_count} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Employee assessment link</CardTitle>
          <CardDescription>
            One QR code and link for the whole cycle. Employees need no account.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {cycle.status === "ACTIVE" && cycle.cycle_token ? (
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
              <canvas ref={canvasRef} className="rounded-md border border-border bg-white p-2" />
              <div className="flex-1 space-y-3">
                <Input readOnly value={shareUrl} onFocus={(event) => event.currentTarget.select()} />
                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="outline"
                    onClick={() => {
                      navigator.clipboard.writeText(shareUrl);
                      toast.success("Link copied");
                    }}
                  >
                    Copy link
                  </Button>
                  <Button variant="outline" onClick={downloadQr}>
                    Download QR
                  </Button>
                  {canLink ? (
                    <Button variant="ghost" onClick={() => setAction({ kind: "regenerate" })}>
                      Regenerate link
                    </Button>
                  ) : null}
                </div>
                <p className="text-xs text-muted-foreground">
                  Regenerating invalidates the previous QR code immediately.
                </p>
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              The link is generated when the cycle is activated.
            </p>
          )}
        </CardContent>
      </Card>

      {cycle.instructions ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Employee instructions</CardTitle>
          </CardHeader>
          <CardContent className="whitespace-pre-line text-sm text-muted-foreground">
            {cycle.instructions}
          </CardContent>
        </Card>
      ) : null}

      <ReasonDialog
        open={action !== null}
        onOpenChange={(open) => !open && setAction(null)}
        title={
          action?.kind === "regenerate"
            ? "Regenerate shared link"
            : action?.kind === "delete"
              ? "Delete draft cycle"
              : (action?.title ?? "Confirm")
        }
        description="Please give a short reason. This is kept in the activity history."
        confirmLabel={
          action?.kind === "regenerate" ? "Regenerate" : action?.kind === "delete" ? "Delete" : (action?.label ?? "Confirm")
        }
        destructive={action?.kind === "delete" || (action?.kind === "status" && action.destructive)}
        pending={mutation.isPending}
        onConfirm={(reason) => mutation.mutate(reason)}
      />
    </div>
  );
}
