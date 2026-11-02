import { createFileRoute, notFound } from "@tanstack/react-router";

import { OperationsModule } from "@/features/operations-management/components/operations-workspace";

const modules = [
  "recommendations",
  "development-plans",
  "courses",
  "learning-paths",
  "quizzes",
  "learners",
  "calendar",
  "sessions",
  "reassessments",
  "effectiveness",
  "reports",
] as const;

export const Route = createFileRoute("/_authenticated/operations/$module")({
  component: OperationsPage,
});

function OperationsPage() {
  const { module } = Route.useParams();
  if (!modules.includes(module as (typeof modules)[number])) throw notFound();
  return <OperationsModule module={module as (typeof modules)[number]} />;
}
