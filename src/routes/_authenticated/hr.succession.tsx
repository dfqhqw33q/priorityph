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
        <div className="space-y-4" aria-label="Career and succession profiles">
          {query.data.map((profile) => {
            const committeeDecision = profile.committeeDecision;
            return (
              <Card key={profile.id}>
                <CardContent className="space-y-6 pt-6">
                  <div className="flex flex-col gap-3 border-b border-border pb-4 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <h2 className="text-base font-semibold">{profile.employeeName}</h2>
                      <p className="text-sm text-muted-foreground">
                        Employee no. {profile.employeeNumber}
                      </p>
                    </div>
                    <Button variant="outline" size="sm" onClick={() => setEditing(profile)}>
                      Edit notes
                    </Button>
                  </div>

                  <section className="space-y-3">
                    <div>
                      <h3 className="font-semibold">Career &amp; Succession Profile</h3>
                      <p className="text-xs text-muted-foreground">
                        Employee career interests and development information from the source
                        evaluation.
                      </p>
                    </div>
                    <div className="grid gap-4 text-sm sm:grid-cols-2 xl:grid-cols-4">
                      <ProfileField
                        label="Development Potential"
                        value={profile.developmentPotential}
                        className="xl:col-span-2"
                      />
                      <ProfileField
                        label="Advancement Outlook"
                        value={profile.advancementOutlook}
                        className="xl:col-span-2"
                      />
                      <ProfileField label="Career Interest" value={profile.careerInterest} />
                      <ProfileField label="Transfer Interest" value={profile.transferInterest} />
                      <ProfileField label="Desired Job" value={profile.desiredJob} />
                      <ProfileField label="Desired Location" value={profile.desiredLocation} />
                      <ProfileField label="Qualification" value={profile.qualification} />
                    </div>
                    <div className="text-sm">
                      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        Source Evaluation
                      </p>
                      <Link
                        className="text-primary hover:underline"
                        to="/hr/evaluation-history/$evaluationId"
                        params={{ evaluationId: profile.sourceEvaluationId }}
                      >
                        {profile.sourceCycleName
                          ? `${profile.sourceCycleName} (${profile.sourceCycleYear})`
                          : "View evaluation"}
                      </Link>
                    </div>
                  </section>

                  <section className="space-y-3 rounded-md border border-primary/30 bg-primary/5 p-4">
                    <div>
                      <h3 className="font-semibold">Latest Committee Decision</h3>
                      <p className="text-xs text-muted-foreground">
                        Finalized organizational action. This does not replace the employee&apos;s
                        career preferences.
                      </p>
                    </div>
                    {committeeDecision ? (
                      <div className="grid gap-4 text-sm sm:grid-cols-2">
                        <ProfileField
                          label="Final Action"
                          value={
                            committeeDecision.finalAction === "PROMOTE" ? "Promote" : "Transfer"
                          }
                        />
                        <ProfileField label="Status" value="Finalized" />
                        <ProfileField
                          label="Action Details"
                          value={committeeDecision.actionDetails}
                          className="whitespace-pre-wrap"
                        />
                        <ProfileField
                          label="Committee Recommendation"
                          value={committeeDecision.recommendation}
                          className="whitespace-pre-wrap"
                        />
                        <div className="sm:col-span-2">
                          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                            Source Evaluation
                          </p>
                          <Link
                            className="text-primary hover:underline"
                            to="/hr/evaluation-history/$evaluationId"
                            params={{ evaluationId: committeeDecision.sourceEvaluationId }}
                          >
                            {committeeDecision.sourceCycleName
                              ? `${committeeDecision.sourceCycleName} (${committeeDecision.sourceCycleYear})`
                              : "View evaluation"}
                          </Link>
                        </div>
                      </div>
                    ) : (
                      <p className="text-sm text-muted-foreground">
                        No finalized Promote or Transfer decision is recorded for this profile.
                      </p>
                    )}
                  </section>

                  <div className="border-t border-border pt-4 text-sm">
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Management Notes
                    </p>
                    <p className="mt-1 whitespace-pre-wrap text-muted-foreground">
                      {profile.notes || "-"}
                    </p>
                  </div>
                </CardContent>
              </Card>
            );
          })}
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

function ProfileField({
  label,
  value,
  className = "",
}: {
  label: string;
  value: string;
  className?: string;
}) {
  return (
    <div className={className}>
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-1 whitespace-pre-wrap">{value || "-"}</p>
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
