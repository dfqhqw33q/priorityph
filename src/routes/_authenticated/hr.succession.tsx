import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
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
import { EmptyState, LoadingBlock, PageHeader } from "@/components/shared/shared-ui";
import {
  listSuccessionProfiles,
  updateSuccessionProfile,
  type SuccessionProfile,
} from "@/features/succession-planning/succession.functions";
import { useDebouncedValue } from "@/hooks/use-debounced-value";

export const Route = createFileRoute("/_authenticated/hr/succession")({
  component: SuccessionPage,
});

function SuccessionPage() {
  const queryClient = useQueryClient();
  const fetchProfiles = useServerFn(listSuccessionProfiles);
  const saveProfile = useServerFn(updateSuccessionProfile);
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedValue(search);
  const [transferInterest, setTransferInterest] = useState("");
  const [editing, setEditing] = useState<SuccessionProfile | null>(null);
  const query = useQuery({
    queryKey: ["succession-profiles", { search: debouncedSearch, transferInterest }],
    queryFn: () => fetchProfiles({ data: { search: debouncedSearch, transferInterest } }),
    retry: false,
  });
  const mutation = useMutation({
    mutationFn: (data: { id: string; notes: string }) => saveProfile({ data }),
    onSuccess: async () => {
      setEditing(null);
      await queryClient.invalidateQueries({ queryKey: ["succession-profiles"] });
    },
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Succession Planning"
        description="Review career interests and succession information for employees."
      />
      <Card>
        <CardContent className="grid gap-4 pt-6 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="succession-search">Search employees or profile information</Label>
            <Input
              id="succession-search"
              placeholder="Search profiles"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="succession-transfer">Transfer interest</Label>
            <Input
              id="succession-transfer"
              placeholder="Filter transfer interest"
              value={transferInterest}
              onChange={(event) => setTransferInterest(event.target.value)}
            />
          </div>
        </CardContent>
      </Card>
      {query.isLoading ? (
        <LoadingBlock rows={8} />
      ) : query.isError ? (
        <EmptyState
          title="Succession profiles could not be loaded"
          description={(query.error as Error).message}
        />
      ) : !query.data?.length ? (
        <EmptyState
          title="No succession profiles"
          description="Profiles appear after finalized evaluations contain Q3, Q4, or Q6 information."
        />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border bg-card shadow-sm">
          <table className="w-full min-w-[1250px] text-left text-sm">
            <caption className="sr-only">Career and succession profiles</caption>
            <thead className="border-b border-border bg-muted/60">
              <tr>
                {[
                  "Employee",
                  "Development Potential",
                  "Advancement Outlook",
                  "Career Interest",
                  "Transfer Interest",
                  "Desired Job",
                  "Desired Location",
                  "Qualification",
                  "Source Evaluation",
                  "Notes",
                  "Actions",
                ].map((heading) => (
                  <th key={heading} className="px-4 py-3 font-semibold">
                    {heading}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {query.data.map((profile) => (
                <tr
                  key={profile.id}
                  className="border-b border-border last:border-0 hover:bg-muted/30"
                >
                  <td className="px-4 py-3">
                    <span className="font-semibold">{profile.employeeName}</span>
                    <span className="block text-xs text-muted-foreground">
                      {profile.employeeNumber}
                    </span>
                  </td>
                  <td className="max-w-xs whitespace-pre-wrap px-4 py-3">
                    {profile.developmentPotential || "-"}
                  </td>
                  <td className="max-w-xs whitespace-pre-wrap px-4 py-3">
                    {profile.advancementOutlook || "-"}
                  </td>
                  <td className="px-4 py-3">{profile.careerInterest || "-"}</td>
                  <td className="px-4 py-3">{profile.transferInterest || "-"}</td>
                  <td className="px-4 py-3">{profile.desiredJob || "-"}</td>
                  <td className="px-4 py-3">{profile.desiredLocation || "-"}</td>
                  <td className="px-4 py-3">{profile.qualification || "-"}</td>
                  <td className="px-4 py-3">
                    <Link
                      className="text-primary hover:underline"
                      to="/hr/evaluation-history/$evaluationId"
                      params={{ evaluationId: profile.sourceEvaluationId }}
                    >
                      {profile.sourceCycleName
                        ? `${profile.sourceCycleName} (${profile.sourceCycleYear})`
                        : "View"}
                    </Link>
                  </td>
                  <td className="max-w-xs whitespace-pre-wrap px-4 py-3 text-muted-foreground">
                    {profile.notes || "-"}
                  </td>
                  <td className="px-4 py-3">
                    <Button variant="outline" size="sm" onClick={() => setEditing(profile)}>
                      Edit notes
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <NotesDialog
        profile={editing}
        pending={mutation.isPending}
        error={mutation.error ? (mutation.error as Error).message : null}
        onClose={() => setEditing(null)}
        onSubmit={(notes) => {
          if (editing) mutation.mutate({ id: editing.id, notes });
        }}
      />
    </div>
  );
}

function NotesDialog({
  profile,
  pending,
  error,
  onClose,
  onSubmit,
}: {
  profile: SuccessionProfile | null;
  pending: boolean;
  error: string | null;
  onClose: () => void;
  onSubmit: (notes: string) => void;
}) {
  const [notes, setNotes] = useState("");
  const [initializedFor, setInitializedFor] = useState<string | null>(null);
  useEffect(() => {
    if (!profile || profile.id === initializedFor) return;
    setInitializedFor(profile.id);
    setNotes(profile.notes);
  }, [initializedFor, profile]);
  return (
    <Dialog
      open={Boolean(profile)}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit succession notes</DialogTitle>
          <DialogDescription>
            Maintain management notes for this career and succession profile.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-1.5">
          <Label htmlFor="succession-notes">Notes</Label>
          <Textarea
            id="succession-notes"
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
          />
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button disabled={pending} onClick={() => onSubmit(notes)}>
            {pending ? "Saving..." : "Save notes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

