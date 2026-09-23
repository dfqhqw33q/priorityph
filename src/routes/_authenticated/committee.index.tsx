import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { type EvaluationStatus } from "@/lib/domain";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  EmptyState,
  DashboardSummaryLayout,
  LoadingBlock,
  PageHeader,
  StatCard,
} from "@/components/shared/shared-ui";
import { ChartContainer, ChartTooltipContent } from "@/components/ui/chart";
import { getCommitteeStats, listEvaluationCycleOptionsForUser } from "@/lib/evaluations.functions";

export const Route = createFileRoute("/_authenticated/committee/")({
  component: CommitteeDashboard,
});

function CommitteeDashboard() {
  const [cycleId, setCycleId] = useState<string | null>(null);
  const fetchStats = useServerFn(getCommitteeStats);
  const fetchCycleOptions = useServerFn(listEvaluationCycleOptionsForUser);

  const cycleOptionsQuery = useQuery({
    queryKey: ["cycle-options"],
    queryFn: () => fetchCycleOptions(),
    retry: false,
  });
  const selectedCycleId = cycleId ?? null;

  const query = useQuery({
    queryKey: ["committee-stats", selectedCycleId ?? "all"],
    queryFn: () => fetchStats({ data: { cycleId: selectedCycleId } }),
    enabled: cycleOptionsQuery.isSuccess,
    retry: false,
  });

  const chartData = useMemo(() => {
    const breakdown = query.data?.statusBreakdown ?? ({} as Record<EvaluationStatus, number>);
    const rows = [
      {
        status: "FOR_REVIEW",
        label: "To Review",
        value: breakdown.FOR_REVIEW ?? 0,
        color: "var(--info)",
      },
      {
        status: "RETURNED",
        label: "Returned",
        value: breakdown.RETURNED ?? 0,
        color: "var(--warning)",
      },
      {
        status: "FOR_APPROVAL",
        label: "Completed",
        value: (breakdown.FOR_APPROVAL ?? 0) + (breakdown.FINALIZED ?? 0),
        color: "var(--success)",
      },
      {
        status: "DRAFT",
        label: "Drafts",
        value: breakdown.DRAFT ?? 0,
        color: "var(--muted-foreground)",
      },
      {
        status: "TRAINING_REQUIRED",
        label: "Training Required",
        value: query.data?.trainingRequired ?? 0,
      },
    ];
    return rows.filter(
      (row) =>
        row.value > 0 ||
        ["FOR_REVIEW", "RETURNED", "FOR_APPROVAL", "TRAINING_REQUIRED"].includes(row.status),
    );
  }, [query.data?.statusBreakdown, query.data?.trainingRequired]);

  if (query.isError) {
    const message = query.error instanceof Error ? query.error.message : "Unavailable";
    return <EmptyState title="You do not have access to committee review" description={message} />;
  }

  const isLoading = query.isLoading || !query.data;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Dashboard"
        description="Review evaluations and record final recommendations."
        actions={
          <div className="flex items-center gap-2">
            <label htmlFor="committee-cycle" className="text-sm font-medium text-foreground">
              Evaluation Cycle
            </label>
            <select
              id="committee-cycle"
              className="h-9 rounded-md border border-input bg-background px-3 text-sm text-foreground shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              value={selectedCycleId ?? "all"}
              onChange={(event) =>
                setCycleId(event.target.value === "all" ? null : event.target.value)
              }
            >
              <option value="all">All cycles</option>
              {(cycleOptionsQuery.data ?? []).map((cycle) => (
                <option key={cycle.id} value={cycle.id}>
                  {cycle.name} ({cycle.year})
                </option>
              ))}
            </select>
          </div>
        }
      />

      {isLoading ? (
        <LoadingBlock rows={4} variant="cards" />
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
            <StatCard
              label="To Review"
              value={query.data?.toReview ?? query.data?.awaiting ?? 0}
              to="/committee/evaluations"
              hint="Ready for recommendation"
            />
            <StatCard
              label="Returned"
              value={query.data?.returned ?? 0}
              to="/committee/returned"
              hint="Needs correction"
            />
            <StatCard
              label="Completed"
              value={query.data?.completed ?? query.data?.finalized ?? 0}
              to="/committee/completed"
              hint="Submitted records"
            />
            <StatCard
              label="Drafts"
              value={query.data?.drafts ?? 0}
              to="/committee/drafts"
              hint="In progress"
            />
            <StatCard
              label="Training Required"
              value={query.data?.trainingRequired ?? 0}
              to="/hr/training"
              hint="Committee final action"
            />
          </div>

          <DashboardSummaryLayout
            status={
              <Card className="border border-border bg-card shadow-sm">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">Evaluation Status</CardTitle>
                </CardHeader>
                <CardContent className="h-[220px] p-3 pt-0">
                  <ChartContainer
                    config={{ value: { color: "var(--info)", label: "Evaluations" } }}
                    className="h-full w-full"
                  >
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart
                        data={chartData}
                        layout="vertical"
                        margin={{ top: 6, right: 12, left: 8, bottom: 6 }}
                        barGap={8}
                      >
                        <CartesianGrid
                          horizontal={false}
                          strokeDasharray="3 3"
                          stroke="var(--border)"
                        />
                        <XAxis
                          type="number"
                          allowDecimals={false}
                          tickLine={false}
                          axisLine={false}
                          tick={{ fill: "var(--muted-foreground)", fontSize: 12 }}
                          domain={[0, (dataMax: number) => Math.max(dataMax, 1)]}
                        />
                        <YAxis
                          type="category"
                          dataKey="label"
                          tickLine={false}
                          axisLine={false}
                          width={98}
                          tick={{ fill: "var(--foreground)", fontSize: 12 }}
                        />
                        <Tooltip
                          cursor={{ fill: "var(--muted)" }}
                          content={
                            <ChartTooltipContent
                              hideLabel
                              formatter={(value) => [value, "Evaluations"]}
                            />
                          }
                        />
                        <Bar
                          dataKey="value"
                          radius={[0, 6, 6, 0]}
                          barSize={18}
                          label={{
                            position: "right",
                            formatter: (value: number | string) => `${value}`,
                            fill: "var(--foreground)",
                            fontSize: 12,
                            fontWeight: 600,
                          }}
                        >
                          {chartData.map((entry) => (
                            <Cell key={entry.status} fill={entry.color} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </ChartContainer>
                </CardContent>
              </Card>
            }
          />
        </>
      )}
    </div>
  );
}
