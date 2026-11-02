import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { PageHeader, StatusBadge } from "@/components/shared/portal-ui";
import { useAccess } from "@/hooks/use-access";
import {
  getEvaluationCycles,
  launchEvaluationCycle,
  saveEvaluationCycle,
  type EvaluationCycleRow,
} from "@/lib/performance-admin.functions";

export const Route = createFileRoute("/_authenticated/hr/cycles")({
  component: EvaluationCyclesPage,
});

type CycleForm = {
  id?: string;
  name: string;
  startsOn: string;
  endsOn: string;
  submissionDeadline: string;
};

const emptyForm = (): CycleForm => ({
  name: "",
  startsOn: new Date().toISOString().slice(0, 10),
  endsOn: new Date().toISOString().slice(0, 10),
  submissionDeadline: "",
});

function EvaluationCyclesPage() {
  const { can } = useAccess();
  const queryClient = useQueryClient();
  const loadCycles = useServerFn(getEvaluationCycles);
  const saveCycle = useServerFn(saveEvaluationCycle);
  const launchCycle = useServerFn(launchEvaluationCycle);
  const [form, setForm] = useState<CycleForm>(emptyForm);
  const query = useQuery({
    queryKey: ["evaluation-cycles"],
    queryFn: () => loadCycles(),
  });
  const saveMutation = useMutation({
    mutationFn: () =>
      saveCycle({
        data: {
          ...(form.id ? { id: form.id } : {}),
          name: form.name,
          startsOn: form.startsOn,
          endsOn: form.endsOn,
          submissionDeadline: form.submissionDeadline || null,
        },
      }),
    onSuccess: async () => {
      toast.success(form.id ? "Evaluation cycle updated." : "Evaluation cycle created.");
      setForm(emptyForm());
      await queryClient.invalidateQueries({ queryKey: ["evaluation-cycles"] });
    },
    onError: (error) => toast.error(error.message),
  });
  const launchMutation = useMutation({
    mutationFn: (periodId: string) => launchCycle({ data: { periodId } }),
    onSuccess: async (result) => {
      toast.success(
        `Cycle launched with ${result.assigned + result.existing} evaluation assignments.`,
      );
      await queryClient.invalidateQueries({ queryKey: ["evaluation-cycles"] });
      await queryClient.invalidateQueries({ queryKey: ["evaluation-assignment-setup"] });
    },
    onError: (error) => toast.error(error.message),
  });

  return (
    <div className="space-y-6">
      <PageHeader
        breadcrumbs={["Performance Management", "Evaluation Cycles"]}
        title="Evaluation Cycles"
        description="Create draft evaluation periods, assign employees, and launch the workflow."
      />
      {can("performance.cycles.create") || can("performance.cycles.edit") ? (
        <Card>
          <CardHeader>
            <CardTitle>{form.id ? "Edit draft cycle" : "Create evaluation cycle"}</CardTitle>
          </CardHeader>
          <CardContent>
            <form
              className="grid gap-4 md:grid-cols-2"
              onSubmit={(event) => {
                event.preventDefault();
                saveMutation.mutate();
              }}
            >
              <label className="space-y-1 text-sm">
                <span>Cycle name</span>
                <Input
                  required
                  minLength={2}
                  maxLength={120}
                  value={form.name}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, name: event.currentTarget.value }))
                  }
                />
              </label>
              <div />
              <label className="space-y-1 text-sm">
                <span>Starts on</span>
                <Input
                  type="date"
                  required
                  value={form.startsOn}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, startsOn: event.currentTarget.value }))
                  }
                />
              </label>
              <label className="space-y-1 text-sm">
                <span>Ends on</span>
                <Input
                  type="date"
                  required
                  value={form.endsOn}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, endsOn: event.currentTarget.value }))
                  }
                />
              </label>
              <label className="space-y-1 text-sm">
                <span>Submission deadline (optional)</span>
                <Input
                  type="date"
                  value={form.submissionDeadline}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      submissionDeadline: event.currentTarget.value,
                    }))
                  }
                />
              </label>
              <div className="flex items-end gap-2">
                <Button
                  type="submit"
                  disabled={
                    saveMutation.isPending ||
                    (form.id ? !can("performance.cycles.edit") : !can("performance.cycles.create"))
                  }
                >
                  {saveMutation.isPending ? "Saving..." : form.id ? "Save changes" : "Create cycle"}
                </Button>
                {form.id ? (
                  <Button type="button" variant="outline" onClick={() => setForm(emptyForm())}>
                    Cancel edit
                  </Button>
                ) : null}
              </div>
            </form>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Configured cycles</CardTitle>
        </CardHeader>
        <CardContent>
          {query.isPending ? (
            <p className="text-sm text-muted-foreground">Loading cycles…</p>
          ) : null}
          {query.isError ? (
            <p role="alert" className="text-sm text-destructive">
              {query.error.message}
            </p>
          ) : null}
          {query.data?.length ? (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] text-left text-sm">
                <thead className="border-b border-border text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="px-3 py-3">Cycle</th>
                    <th className="px-3 py-3">Dates</th>
                    <th className="px-3 py-3">Deadline</th>
                    <th className="px-3 py-3">Assignments</th>
                    <th className="px-3 py-3">Status</th>
                    <th className="px-3 py-3">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {query.data.map((cycle) => (
                    <tr key={cycle.id}>
                      <td className="px-3 py-3 font-medium">{cycle.name}</td>
                      <td className="px-3 py-3">
                        {cycle.startsOn} – {cycle.endsOn}
                      </td>
                      <td className="px-3 py-3">{cycle.submissionDeadline ?? "—"}</td>
                      <td className="px-3 py-3">{cycle.assignedCount}</td>
                      <td className="px-3 py-3">
                        <StatusBadge>{cycle.status}</StatusBadge>
                      </td>
                      <td className="flex gap-2 px-3 py-3">
                        {cycle.status === "DRAFT" && can("performance.cycles.edit") ? (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => editCycle(cycle, setForm)}
                          >
                            Edit
                          </Button>
                        ) : null}
                        {cycle.status === "DRAFT" && can("performance.cycles.launch") ? (
                          <Button
                            size="sm"
                            disabled={launchMutation.isPending}
                            onClick={() => launchMutation.mutate(cycle.id)}
                          >
                            Launch
                          </Button>
                        ) : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : !query.isPending && !query.isError ? (
            <p className="text-sm text-muted-foreground">No evaluation cycles have been created.</p>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}

function editCycle(cycle: EvaluationCycleRow, setForm: (form: CycleForm) => void) {
  setForm({
    id: cycle.id,
    name: cycle.name,
    startsOn: cycle.startsOn,
    endsOn: cycle.endsOn,
    submissionDeadline: cycle.submissionDeadline ?? "",
  });
}
