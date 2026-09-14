import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  EmptyState,
  LoadingBlock,
  PageHeader,
  formatDateTime,
} from "@/components/shared/shared-ui";
import { getCompetencyProfile } from "@/lib/reports.functions";

export const Route = createFileRoute("/_authenticated/hr/competency/$employeeId")({
  component: CompetencyProfilePage,
});

function CompetencyProfilePage() {
  const { employeeId } = Route.useParams();
  const fetchProfile = useServerFn(getCompetencyProfile);
  const query = useQuery({
    queryKey: ["competency-profile", employeeId],
    queryFn: () => fetchProfile({ data: { employeeId } }),
    retry: false,
  });
  if (query.isLoading) return <LoadingBlock rows={8} variant="detail" />;
  if (query.isError || !query.data)
    return (
      <EmptyState
        title="Competency profile unavailable"
        description={query.isError ? (query.error as Error).message : "Employee record not found."}
      />
    );
  const { employee, latest, history } = query.data;
  const strengths =
    latest?.factors.filter((factor) => factor.analysis === "Competency Strength") ?? [];
  const development =
    latest?.factors.filter(
      (factor) =>
        factor.analysis === "Development Need" || factor.analysis === "Possible Development Area",
    ) ?? [];
  return (
    <div className="space-y-6">
      <PageHeader
        title={employee.full_name}
        description={`${employee.job_title || "Employee"} - Employee no. ${employee.employee_number}`}
        actions={
          <Link className="text-sm font-medium text-primary hover:underline" to="/hr/competency">
            Back to employees
          </Link>
        }
      />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Summary label="Finalized cycles" value={history.length} />
        <Summary label="Strengths" value={strengths.length} />
        <Summary label="Development areas" value={development.length} />
        <Summary label="Latest source" value={latest?.cycleYear || "-"} />
      </div>
      {!latest ? (
        <EmptyState
          title="No finalized evaluation yet"
          description="No competency information is available for this employee yet."
        />
      ) : (
        <>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Employee profile and competency summary</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 text-sm sm:grid-cols-2 lg:grid-cols-4">
              <Info label="Division" value={employee.division} />
              <Info label="Section" value={employee.section} />
              <Info
                label="Strengths"
                value={strengths.map((factor) => factor.title).join(", ") || "-"}
              />
              <Info
                label="Possible development areas"
                value={development.map((factor) => factor.title).join(", ") || "-"}
              />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Competency Profile (A-J Factors)</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="border-b border-primary/30 bg-primary text-primary-foreground dark:border-border dark:bg-muted/60 dark:text-foreground">
                    <tr>
                      {[
                        "Factor",
                        "Employee",
                        "Immediate Supervisor",
                        "Reviewing Supervisor",
                        "Analysis",
                        "Trend",
                      ].map((heading) => (
                        <th key={heading} className="px-3 py-3 font-semibold">
                          {heading}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {latest.factors.map((factor) => (
                      <tr key={factor.letter} className="border-b border-border last:border-0">
                        <td className="px-3 py-3">
                          <span className="mr-2 text-xs text-muted-foreground">
                            {factor.letter}
                          </span>
                          <span className="font-medium">{factor.title}</span>
                        </td>
                        <td className="px-3 py-3 tabular-nums">{factor.employee ?? "-"}</td>
                        <td className="px-3 py-3 tabular-nums">{factor.supervisor ?? "-"}</td>
                        <td className="px-3 py-3 tabular-nums">
                          {factor.reviewingSupervisor ?? "-"}
                        </td>
                        <td className="px-3 py-3">
                          <Badge variant="outline">{factor.analysis}</Badge>
                        </td>
                        <td className="px-3 py-3 text-xs text-muted-foreground">{factor.trend}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="mt-4 text-xs text-muted-foreground">
                Rating differences are analytical indicators only and do not automatically confirm a
                competency gap.
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Development and source evaluation</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 text-sm">
              <Info label="Strengths recorded by Immediate Supervisor" value={latest.strengths} />
              <Info label="Development information" value={latest.development} />
              <Info
                label="Development / training recommendations"
                value={latest.developmentRecommendations}
              />
              <Info
                label="Source"
                value={`${latest.sourceLabel}  -  finalized ${formatDateTime(latest.finalizedAt)}`}
              />
              <Link
                className="font-medium text-primary hover:underline"
                to="/hr/evaluation-history/$evaluationId"
                params={{ evaluationId: latest.id }}
              >
                Open source evaluation history
              </Link>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Competency History</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {history.map((period) => (
                  <div
                    key={period.id}
                    className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-3 last:border-0 last:pb-0"
                  >
                    <div>
                      <p className="font-semibold">
                        {period.cycleYear} - {period.sourceLabel}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {period.factors.length} factors from finalized evaluation
                      </p>
                    </div>
                    <Link
                      className="text-sm font-medium text-primary hover:underline"
                      to="/hr/evaluation-history/$evaluationId"
                      params={{ evaluationId: period.id }}
                    >
                      View source
                    </Link>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

function Summary({ label, value }: { label: string; value: string | number }) {
  return (
    <Card>
      <CardContent className="pt-5">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {label}
        </p>
        <p className="mt-2 text-2xl font-bold tabular-nums">{value}</p>
      </CardContent>
    </Card>
  );
}
function Info({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-1 whitespace-pre-wrap font-medium">{value || "-"}</p>
    </div>
  );
}
