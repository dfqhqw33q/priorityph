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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string | null>(null);
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
        selectedEmployeeId ? (
          <SuccessionDetail
            profile={query.data.find((item) => item.employeeId === selectedEmployeeId)}
            onBack={() => setSelectedEmployeeId(null)}
            onEdit={setEditing}
          />
        ) : (
          <div className="border border-border bg-card shadow-sm">
            <Table>
              <caption className="sr-only">Succession profiles by employee</caption>
              <TableHeader><TableRow><TableHead>Employee ID</TableHead><TableHead>Full Name</TableHead><TableHead>Job Title</TableHead><TableHead>Division / Department</TableHead><TableHead>Section / Unit</TableHead><TableHead>Cycle</TableHead></TableRow></TableHeader>
              <TableBody>{query.data.map((profile) => <TableRow key={profile.id}><TableCell className="whitespace-nowrap"><button type="button" className="font-normal text-foreground hover:text-primary hover:underline" onClick={() => setSelectedEmployeeId(profile.employeeId)}>{profile.employeeNumber}</button></TableCell><TableCell><button type="button" className="font-normal text-foreground hover:text-primary hover:underline" onClick={() => setSelectedEmployeeId(profile.employeeId)}>{profile.employeeName}</button></TableCell><TableCell>{profile.employeeJobTitle || "-"}</TableCell><TableCell>{profile.employeeDivision || "-"}</TableCell><TableCell>{profile.employeeSection || "-"}</TableCell><TableCell>{profile.sourceCycleName ? `${profile.sourceCycleName} (${profile.sourceCycleYear})` : "-"}</TableCell></TableRow>)}</TableBody>
            </Table>
          </div>
        )
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

function SuccessionDetail({
  profile,
  onBack,
  onEdit,
}: {
  profile: SuccessionProfile | undefined;
  onBack: () => void;
  onEdit: (profile: SuccessionProfile) => void;
}) {
  if (!profile) return null;
  const decision = profile.committeeDecision;
  return (
    <div className="space-y-4">
      <Button variant="outline" onClick={onBack}>Back to employees</Button>
      <Card><CardContent className="pt-6"><div className="flex items-start justify-between gap-3"><div><p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Employee ID</p><h2 className="text-xl font-semibold">{profile.employeeName}</h2><p className="text-sm text-muted-foreground">{profile.employeeNumber}</p></div><Button variant="outline" size="sm" onClick={() => onEdit(profile)}>Edit notes</Button></div></CardContent></Card>
      <Card><CardContent className="grid gap-4 pt-6 text-sm sm:grid-cols-2"><ProfileField label="Development Potential" value={profile.developmentPotential} className="sm:col-span-2" /><ProfileField label="Advancement Outlook" value={profile.advancementOutlook} className="sm:col-span-2" /><ProfileField label="Career Interest" value={profile.careerInterest} /><ProfileField label="Transfer Interest" value={profile.transferInterest} /><ProfileField label="Desired Job" value={profile.desiredJob} /><ProfileField label="Desired Location" value={profile.desiredLocation} /><ProfileField label="Qualification" value={profile.qualification} /><div><p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Source Evaluation</p><Link className="text-primary hover:underline" to="/hr/evaluation-history/$evaluationId" params={{ evaluationId: profile.sourceEvaluationId }}>{profile.sourceCycleName ? `${profile.sourceCycleName} (${profile.sourceCycleYear})` : "View evaluation"}</Link></div></CardContent></Card>
      <Card><CardContent className="space-y-3 pt-6"><h3 className="font-semibold">Committee Decision</h3>{decision ? <div className="grid gap-3 text-sm sm:grid-cols-2"><ProfileField label="Final Action" value={decision.finalAction === "PROMOTE" ? "Promote" : "Transfer"} /><ProfileField label="Status" value="Finalized" /><ProfileField label="Action Details" value={decision.actionDetails} className="whitespace-pre-wrap" /><ProfileField label="Committee Recommendation" value={decision.recommendation} className="whitespace-pre-wrap" /></div> : <p className="text-sm text-muted-foreground">No finalized Promote or Transfer decision is recorded for this profile.</p>}</CardContent></Card>
      <Card><CardContent className="pt-6"><ProfileField label="Management Notes" value={profile.notes} className="whitespace-pre-wrap" /></CardContent></Card>
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
