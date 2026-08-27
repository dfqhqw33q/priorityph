import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
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
} from "@/components/ui/table";
import { CycleStatusBadge, EmptyState, LoadingBlock, PageHeader, formatDateTime } from "@/components/ui-bits";
import { listCycles, listTemplates, saveCycle } from "@/lib/cycles.functions";
import { useAccess } from "@/hooks/use-access";

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
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

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
    onSuccess: (result) => {
      toast.success("Cycle created");
      setOpen(false);
      queryClient.invalidateQueries({ queryKey: ["cycles"] });
      navigate({ to: "/hr/cycles/$cycleId", params: { cycleId: result.cycleId } });
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Could not save the cycle"),
  });

  const rows = (cyclesQuery.data ?? []).filter((cycle) =>
    `${cycle.name} ${cycle.year} ${cycle.status}`.toLowerCase().includes(search.toLowerCase()),
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Evaluation cycles"
        description="Each yearly cycle has one assessment link and QR code shared with all employees."
        actions={
          can("cycles.manage") ? <Button onClick={() => setOpen(true)}>New cycle</Button> : undefined
        }
      />

      <Input
        placeholder="Search cycles"
        value={search}
        onChange={(event) => setSearch(event.target.value)}
        className="max-w-sm"
      />

      {cyclesQuery.isLoading ? (
        <LoadingBlock />
      ) : rows.length === 0 ? (
        <EmptyState title="No cycles yet" description="Create an annual cycle to get started." />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border bg-card shadow-sm">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Cycle</TableHead>
                <TableHead>Year</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Open dates</TableHead>
                <TableHead className="text-right">Self-assessments</TableHead>
                <TableHead className="text-right">Supervisor reviews</TableHead>
                <TableHead />
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
                  <TableCell className="text-xs text-muted-foreground">
                    {formatDateTime(cycle.starts_at)} → {formatDateTime(cycle.ends_at)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{cycle.step1_count}</TableCell>
                  <TableCell className="text-right tabular-nums">{cycle.supervisor_count}</TableCell>
                  <TableCell className="text-right">
                    <Button variant="outline" size="sm" asChild>
                      <Link to="/hr/cycles/$cycleId" params={{ cycleId: cycle.id }}>
                        Open
                      </Link>
                    </Button>
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
            <DialogDescription>New cycles start as a draft. Activate the cycle to share the employee link.</DialogDescription>
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
                  onChange={(event) => setForm((prev) => ({ ...prev, startsAt: event.target.value }))}
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
                onChange={(event) => setForm((prev) => ({ ...prev, instructions: event.target.value }))}
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
    </div>
  );
}
