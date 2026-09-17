import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  ResponsiveTableValue,
} from "@/components/ui/table";
import {
  CycleStatusBadge,
  EmptyState,
  LoadingBlock,
  PageHeader,
  formatCompactDateTime,
  formatCompactDateTimeParts,
  ReasonDialog,
} from "@/components/shared/shared-ui";
import { changeCycleStatus, listCycles, listTemplates, saveCycle } from "@/lib/cycles.functions";
import { useAccess } from "@/hooks/use-access";
import type { CycleSummary } from "@/lib/domain";

export const Route = createFileRoute("/_authenticated/hr/cycles/")({
  component: CyclesPage,
});

function CyclesPage() {
  const { can } = useAccess();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const fetchCycles = useServerFn(listCycles);
  const fetchTemplates = useServerFn(listTemplates);
  const save = useServerFn(saveCycle);
  const setStatus = useServerFn(changeCycleStatus);
  const [open, setOpen] = useState(false);
  const [selectedCycle, setSelectedCycle] = useState<CycleSummary | null>(null);
  const [activateCycleId, setActivateCycleId] = useState<string | null>(null);
  const [archiveCycleId, setArchiveCycleId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [status, setStatusFilter] = useState("ALL");
  const [qrCodeUrl, setQrCodeUrl] = useState<string | null>(null);

  const cyclesQuery = useQuery({ queryKey: ["cycles"], queryFn: () => fetchCycles() });
  const templatesQuery = useQuery({ queryKey: ["templates"], queryFn: () => fetchTemplates() });

  const [form, setForm] = useState({
    name: "",
    year: String(new Date().getFullYear()),
    templateId: "",
    instructions: "",
    startsAt: "",
    endsAt: "",
  });

  const mutation = useMutation({
    mutationFn: async () =>
      save({
        data: {
          name: form.name,
          year: Number(form.year),
          templateId: form.templateId,
          instructions: form.instructions,
          startsAt: new Date(form.startsAt).toISOString(),
          endsAt: new Date(form.endsAt).toISOString(),
        },
      }),
    onSuccess: () => {
      toast.success("Cycle created");
      setOpen(false);
      queryClient.invalidateQueries({ queryKey: ["cycles"] });
      navigate({ to: "/hr/cycles" });
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : "Could not save the cycle"),
  });

  const rows = (cyclesQuery.data ?? []).filter((cycle) =>
    `${cycle.name} ${cycle.year} ${cycle.status}`.toLowerCase().includes(search.toLowerCase()) &&
    (status === "ALL" || cycle.status === status),
  );

  const shareUrl =
    selectedCycle?.cycle_token && typeof window !== "undefined"
      ? `${window.location.origin}/evaluation/${selectedCycle.cycle_token}`
      : "";

  useEffect(() => {
    let cancelled = false;
    setQrCodeUrl(null);
    if (!shareUrl) return;
    QRCode.toDataURL(shareUrl, { width: 220, margin: 1 })
      .then((url) => {
        if (!cancelled) setQrCodeUrl(url);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [shareUrl]);

  const activateMutation = useMutation({
    mutationFn: (reason: string) =>
      setStatus({ data: { cycleId: activateCycleId!, status: "ACTIVE", reason } }),
    onSuccess: () => {
      setActivateCycleId(null);
      queryClient.invalidateQueries({ queryKey: ["cycles"] });
      toast.success("Cycle activated");
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : "Could not activate cycle"),
  });

  const archiveMutation = useMutation({
    mutationFn: (reason: string) =>
      setStatus({ data: { cycleId: archiveCycleId!, status: "DISABLED", reason } }),
    onSuccess: () => {
      setArchiveCycleId(null);
      queryClient.invalidateQueries({ queryKey: ["cycles"] });
      toast.success("Cycle archived");
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : "Could not archive cycle"),
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Evaluation cycles"
        description="Each yearly cycle has one assessment link and QR code shared with all employees."
      />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="min-w-0 flex-1 space-y-1.5">
          <Label htmlFor="cycle-search">Search Cycle</Label>
          <Input
            id="cycle-search"
            placeholder="Search cycles"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>
        <div className="w-full space-y-1.5 sm:w-44">
          <Label htmlFor="cycle-status">Status</Label>
          <select
            id="cycle-status"
            className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            value={status}
            onChange={(event) => setStatusFilter(event.target.value)}
          >
            <option value="ALL">All</option>
            <option value="ACTIVE">Open</option>
            <option value="CLOSED">Closed</option>
            <option value="DISABLED">Archived</option>
          </select>
        </div>
        {can("cycles.manage") ? <Button onClick={() => setOpen(true)}>New Cycle</Button> : null}
      </div>

      {cyclesQuery.isLoading ? (
        <LoadingBlock />
      ) : rows.length === 0 ? (
        <EmptyState title="No cycles yet" description="Create an annual cycle to get started." />
      ) : (
        <div className="overflow-x-auto border border-border bg-card shadow-sm">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Cycle</TableHead>
                <TableHead>Year</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Opens</TableHead>
                <TableHead>Closes</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((cycle) => (
                <TableRow key={cycle.id}>
                  <TableCell className="font-medium">{cycle.name}</TableCell>
                  <TableCell>{cycle.year}</TableCell>
                  <TableCell>
                    <CycleStatusBadge status={cycle.status} />
                  </TableCell>
                  <TableCell data-responsive-table-cell className="text-xs text-muted-foreground">
                    <ResponsiveTableValue mobileLines={formatCompactDateTimeParts(cycle.starts_at)}>
                      {formatCompactDateTime(cycle.starts_at)}
                    </ResponsiveTableValue>
                  </TableCell>
                  <TableCell data-responsive-table-cell className="text-xs text-muted-foreground">
                    <ResponsiveTableValue mobileLines={formatCompactDateTimeParts(cycle.ends_at)}>
                      {formatCompactDateTime(cycle.ends_at)}
                    </ResponsiveTableValue>
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-right">
                    <div className="flex justify-end gap-2">
                      {cycle.status === "DRAFT" && can("cycles.manage") ? (
                        <Button size="sm" onClick={() => setActivateCycleId(cycle.id)}>
                          Activate
                        </Button>
                      ) : (
                        <Button variant="outline" size="sm" onClick={() => setSelectedCycle(cycle)}>
                          QR Code
                        </Button>
                      )}
                      {can("cycles.manage") && cycle.status !== "DISABLED" ? (
                        <Button variant="ghost" size="sm" onClick={() => setArchiveCycleId(cycle.id)}>
                          Archive
                        </Button>
                      ) : null}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>New evaluation cycle</DialogTitle>
            <DialogDescription>
              New cycles start as a draft. Activate the cycle to share the employee link.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Cycle name</Label>
              <Input
                id="name"
                value={form.name}
                onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="year">Year</Label>
                <Input
                  id="year"
                  type="number"
                  value={form.year}
                  onChange={(event) => setForm((prev) => ({ ...prev, year: event.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label>Template</Label>
                <Select
                  value={form.templateId}
                  onValueChange={(value) => setForm((prev) => ({ ...prev, templateId: value }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select a template" />
                  </SelectTrigger>
                  <SelectContent>
                    {(templatesQuery.data ?? []).map((template) => (
                      <SelectItem key={template.id} value={template.id}>
                        {template.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="startsAt">Opens on</Label>
                <Input
                  id="startsAt"
                  type="datetime-local"
                  value={form.startsAt}
                  onChange={(event) =>
                    setForm((prev) => ({ ...prev, startsAt: event.target.value }))
                  }
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="endsAt">Closes (local time)</Label>
                <Input
                  id="endsAt"
                  type="datetime-local"
                  value={form.endsAt}
                  onChange={(event) => setForm((prev) => ({ ...prev, endsAt: event.target.value }))}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="instructions">Instructions shown to employees</Label>
              <Textarea
                id="instructions"
                rows={3}
                value={form.instructions}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, instructions: event.target.value }))
                }
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button onClick={() => mutation.mutate()} disabled={mutation.isPending}>
              Create cycle
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={selectedCycle !== null} onOpenChange={(isOpen) => !isOpen && setSelectedCycle(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Performance Evaluation {selectedCycle?.year}</DialogTitle>
            <DialogDescription>QR Code</DialogDescription>
          </DialogHeader>
          <div className="flex justify-center">
            {qrCodeUrl ? (
              <img
                src={qrCodeUrl}
                alt={`QR code for Performance Evaluation ${selectedCycle?.year}`}
                className="rounded-md border border-border bg-white p-2"
                width={236}
                height={236}
              />
            ) : (
              <p className="text-sm text-muted-foreground">
                A QR code is available after activation.
              </p>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <ReasonDialog
        open={activateCycleId !== null}
        onOpenChange={(isOpen) => !isOpen && setActivateCycleId(null)}
        title="Activate cycle"
        description="Activating this cycle will generate its employee evaluation link and QR code."
        confirmLabel="Activate"
        pending={activateMutation.isPending}
        onConfirm={(reason) => activateMutation.mutate(reason)}
      />

      <ReasonDialog
        open={archiveCycleId !== null}
        onOpenChange={(isOpen) => !isOpen && setArchiveCycleId(null)}
        title="Archive cycle"
        description="Please give a short reason. The cycle and its records will remain viewable."
        confirmLabel="Archive"
        pending={archiveMutation.isPending}
        onConfirm={(reason) => archiveMutation.mutate(reason)}
      />
    </div>
  );
}
