import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { PageHeader, StatusBadge } from "@/components/shared/portal-ui";
import {
  activateEvaluationProfile,
  createEvaluationProfile,
  getActiveEvaluationJobPositions,
  getEvaluationProfiles,
} from "@/lib/performance-admin.functions";

export const Route = createFileRoute("/_authenticated/hr/profiles")({
  component: EvaluationProfilesPage,
});

const emptyCategories = () =>
  Array.from({ length: 8 }, (_, index) => ({
    name: `Category ${index + 1}`,
    weight: 12.5,
  }));

function EvaluationProfilesPage() {
  const queryClient = useQueryClient();
  const loadProfiles = useServerFn(getEvaluationProfiles);
  const loadPositions = useServerFn(getActiveEvaluationJobPositions);
  const createProfile = useServerFn(createEvaluationProfile);
  const activateProfile = useServerFn(activateEvaluationProfile);
  const profilesQuery = useQuery({
    queryKey: ["evaluation-profiles"],
    queryFn: () => loadProfiles(),
  });
  const positionsQuery = useQuery({
    queryKey: ["active-job-positions"],
    queryFn: () => loadPositions(),
  });
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [jobPositionId, setJobPositionId] = useState("");
  const [effectiveFrom, setEffectiveFrom] = useState(new Date().toISOString().slice(0, 10));
  const [categories, setCategories] = useState(emptyCategories);
  const totalWeight = categories.reduce((total, category) => total + category.weight, 0);
  const createMutation = useMutation({
    mutationFn: () =>
      createProfile({
        data: { name, description, jobPositionId, effectiveFrom, categories },
      }),
    onSuccess: async (result) => {
      toast.success(`Draft profile v${result.version} created.`);
      setName("");
      setDescription("");
      setCategories(emptyCategories());
      await queryClient.invalidateQueries({ queryKey: ["evaluation-profiles"] });
    },
    onError: (error) => toast.error(error.message),
  });
  const activateMutation = useMutation({
    mutationFn: (profileId: string) => activateProfile({ data: { profileId, effectiveFrom } }),
    onSuccess: async () => {
      toast.success("Evaluation profile activated.");
      await queryClient.invalidateQueries({ queryKey: ["evaluation-profiles"] });
    },
    onError: (error) => toast.error(error.message),
  });

  return (
    <div className="space-y-6">
      <PageHeader
        breadcrumbs={["Performance Management", "Evaluation Profiles"]}
        title="Evaluation Profiles"
        description="Create versioned eight-category profile drafts and activate them for a job position. Active versions remain immutable."
      />
      <Card>
        <CardHeader>
          <CardTitle>Create profile draft</CardTitle>
        </CardHeader>
        <CardContent>
          {positionsQuery.isPending ? (
            <p className="text-sm text-muted-foreground">Loading job positions…</p>
          ) : null}
          {positionsQuery.isError ? (
            <p role="alert" className="text-sm text-destructive">
              {positionsQuery.error.message}
            </p>
          ) : null}
          <form
            className="space-y-4"
            onSubmit={(event) => {
              event.preventDefault();
              createMutation.mutate();
            }}
          >
            <div className="grid gap-4 md:grid-cols-2">
              <label className="space-y-1 text-sm">
                <span>Profile name</span>
                <Input
                  required
                  minLength={2}
                  maxLength={120}
                  value={name}
                  onChange={(event) => setName(event.currentTarget.value)}
                />
              </label>
              <label className="space-y-1 text-sm">
                <span>Job position</span>
                <select
                  required
                  className="h-10 w-full rounded-md border border-input bg-background px-3"
                  value={jobPositionId}
                  onChange={(event) => setJobPositionId(event.currentTarget.value)}
                >
                  <option value="">Select a position</option>
                  {(positionsQuery.data ?? []).map((position) => (
                    <option key={position.id} value={position.id}>
                      {position.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="space-y-1 text-sm">
                <span>Description</span>
                <Input
                  maxLength={2000}
                  value={description}
                  onChange={(event) => setDescription(event.currentTarget.value)}
                />
              </label>
              <label className="space-y-1 text-sm">
                <span>Effective from</span>
                <Input
                  type="date"
                  required
                  value={effectiveFrom}
                  onChange={(event) => setEffectiveFrom(event.currentTarget.value)}
                />
              </label>
            </div>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="font-medium">Evaluation categories</h3>
                <span
                  className={
                    Math.abs(totalWeight - 100) < 0.0001
                      ? "text-sm text-green-700"
                      : "text-sm text-destructive"
                  }
                >
                  Weight total: {totalWeight.toFixed(2)}%
                </span>
              </div>
              {categories.map((category, index) => (
                <div key={index} className="grid gap-3 sm:grid-cols-[1fr_150px]">
                  <Input
                    aria-label={`Category ${index + 1} name`}
                    required
                    value={category.name}
                    onChange={(event) =>
                      setCategories((current) =>
                        current.map((item, itemIndex) =>
                          itemIndex === index ? { ...item, name: event.currentTarget.value } : item,
                        ),
                      )
                    }
                  />
                  <Input
                    aria-label={`Category ${index + 1} weight`}
                    type="number"
                    min="0.01"
                    max="100"
                    step="0.01"
                    required
                    value={category.weight}
                    onChange={(event) =>
                      setCategories((current) =>
                        current.map((item, itemIndex) =>
                          itemIndex === index
                            ? { ...item, weight: Number(event.currentTarget.value) }
                            : item,
                        ),
                      )
                    }
                  />
                </div>
              ))}
            </div>
            <Button
              type="submit"
              disabled={
                createMutation.isPending ||
                !jobPositionId ||
                !name.trim() ||
                Math.abs(totalWeight - 100) >= 0.0001
              }
            >
              {createMutation.isPending ? "Creating…" : "Create draft profile"}
            </Button>
          </form>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Profiles and versions</CardTitle>
        </CardHeader>
        <CardContent>
          {profilesQuery.isPending ? (
            <p className="text-sm text-muted-foreground">Loading profiles…</p>
          ) : null}
          {profilesQuery.isError ? (
            <p role="alert" className="text-sm text-destructive">
              {profilesQuery.error.message}
            </p>
          ) : null}
          {profilesQuery.data?.length ? (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[750px] text-left text-sm">
                <thead className="border-b border-border text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="px-3 py-3">Profile</th>
                    <th className="px-3 py-3">Position</th>
                    <th className="px-3 py-3">Version</th>
                    <th className="px-3 py-3">Categories / weights</th>
                    <th className="px-3 py-3">Status</th>
                    <th className="px-3 py-3">Effective from</th>
                    <th className="px-3 py-3">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {profilesQuery.data.map((profile) => (
                    <tr key={profile.id}>
                      <td className="px-3 py-3 font-medium">{profile.name}</td>
                      <td className="px-3 py-3">{profile.jobPosition}</td>
                      <td className="px-3 py-3">v{profile.version}</td>
                      <td className="px-3 py-3">
                        {profile.categoryCount} · {profile.weightTotal.toFixed(2)}%
                      </td>
                      <td className="px-3 py-3">
                        <StatusBadge>{profile.status}</StatusBadge>
                      </td>
                      <td className="px-3 py-3">{profile.effectiveFrom ?? "Not set"}</td>
                      <td className="px-3 py-3">
                        {profile.status === "DRAFT" ? (
                          <Button
                            size="sm"
                            disabled={activateMutation.isPending}
                            onClick={() => activateMutation.mutate(profile.id)}
                          >
                            Activate
                          </Button>
                        ) : (
                          "—"
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
