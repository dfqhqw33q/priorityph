import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  EmptyState,
  LoadingBlock,
  PageHeader,
  StatCard,
  formatDateTime,
} from "@/components/shared/shared-ui";
import { ChartContainer, ChartTooltipContent } from "@/components/ui/chart";
import { getPresidentStats } from "@/lib/president.functions";
import { EVALUATION_STATUS_LABELS, humanizeToken } from "@/lib/domain";
import { listEvaluationCycleOptionsForUser } from "@/lib/evaluations.functions";

export const Route = createFileRoute("/_authenticated/president/")({
  head: () => ({
    meta: [
      { title: "President dashboard | Priority Handling Logistics, Inc." },
      {
        name: "description",
        content: "Track supervisor submissions and complete Step 2 conclusions and Step 3 review.",
      },
      { property: "og:title", content: "President dashboard" },
      {
        property: "og:description",
        content: "Evaluations awaiting presidential review and sign-off.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: PresidentDashboard,
});

function PresidentDashboard() {
  const [cycleId, setCycleId] = useState<string | null>(null);
  const fetchStats = useServerFn(getPresidentStats);
  const fetchCycleOptions = useServerFn(listEvaluationCycleOptionsForUser);

  const cycleOptionsQuery = useQuery({
    queryKey: ["cycle-options", "president"],
    queryFn: () => fetchCycleOptions(),
    retry: false,
  });

  const query = useQuery({
    queryKey: ["president-stats", cycleId],
    queryFn: () => fetchStats({ data: { cycleId } }),
    retry: false,
  });

  const chartData = useMemo(
    () =>
      Object.entries(query.data?.statusBreakdown ?? {}).map(([status, value]) => ({
        status,
        label: EVALUATION_STATUS_LABELS[status as keyof typeof EVALUATION_STATUS_LABELS] ?? humanizeToken(status),
        value,
      })),
    [query.data?.statusBreakdown],
  );

  if (query.isError) {
    const message = query.error instanceof Error ? query.error.message : "Unavailable";
    return <EmptyState title="You do not have access to President review" description={message} />;
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="President dashboard"
        description="Review completed evaluations and make the final approval decision."
        actions={
          <Button asChild>
            <Link to="/president/evaluations">Open evaluations to review</Link>
          </Button>
        }
      />

      <Card className="border border-border bg-card shadow-sm">
        <CardContent className="pt-5">
          <div className="space-y-1.5 md:w-72">
            <label htmlFor="president-cycle" className="text-sm font-medium text-foreground">
              Evaluation cycle
            </label>
            <select
              id="president-cycle"
              className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              value={cycleId ?? "all"}
              onChange={(event) => setCycleId(event.target.value === "all" ? null : event.target.value)}
            >
              <option value="all">All cycles</option>
              {(cycleOptionsQuery.data ?? []).map((cycle) => (
                <option key={cycle.id} value={cycle.id}>
                  {cycle.name} ({cycle.year})
                </option>
              ))}
            </select>
          </div>
        </CardContent>
      </Card>

      {query.isLoading ? (
        <LoadingBlock rows={4} variant="cards" />
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
            <StatCard label="Awaiting your review" value={query.data?.awaiting ?? 0} to="/president/evaluations" hint="Ready for approval" />
            <StatCard label="In review" value={query.data?.inReview ?? 0} to="/president/evaluations" hint="Current queue" />
            <StatCard label="Step 2 complete" value={query.data?.step2Completed ?? 0} to="/president/evaluations" hint="Prepared" />
            <StatCard label="Step 3 complete" value={query.data?.step3Completed ?? 0} to="/president/evaluations" hint="Ready for final sign-off" />
            <StatCard label="Finalized" value={query.data?.finalized ?? 0} to="/hr/completed" hint="Completed" />
          </div>

          <div className="grid gap-4 xl:grid-cols-[1.6fr_0.9fr]">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Approval status</CardTitle>
              </CardHeader>
              <CardContent className="h-72">
                <ChartContainer config={{ value: { color: "hsl(var(--chart-4))", label: "Evaluations" } }} className="h-full w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={chartData} margin={{ top: 8, right: 8, left: -12, bottom: 8 }}>
                      <CartesianGrid vertical={false} strokeDasharray="3 3" />
                      <XAxis dataKey="label" tickLine={false} axisLine={false} interval={0} angle={-20} textAnchor="end" height={52} />
                      <YAxis allowDecimals={false} tickLine={false} axisLine={false} />
                      <Tooltip cursor={{ fill: "hsl(var(--muted))" }} content={<ChartTooltipContent hideLabel formatter={(value) => [value, "Evaluations"]} />} />
                      <Bar dataKey="value" fill="hsl(var(--chart-4))" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </ChartContainer>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Recent President activity</CardTitle>
              </CardHeader>
              <CardContent>
                {(query.data?.activity ?? []).length === 0 ? (
                  <p className="text-sm text-muted-foreground">No president activity recorded yet.</p>
                ) : (
                  <ul className="divide-y divide-border text-sm">
                    {(query.data?.activity ?? []).map((event) => (
                      <li key={event.id} className="flex flex-wrap justify-between gap-2 py-2">
                        <span className="font-medium text-foreground">{humanizeToken(event.action)}</span>
                        <span className="text-xs text-muted-foreground">{formatDateTime(event.occurred_at)}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
