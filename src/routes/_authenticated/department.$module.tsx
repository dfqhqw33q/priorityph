import { createFileRoute } from "@tanstack/react-router";

import { EmptyState, PageHeader } from "@/components/shared/portal-ui";
import { CompetencyWorkspace } from "@/features/competency-management/components/competency-workspace";

const moduleLabels: Record<string, string> = {
  competencies: "Competency & Gap Overview",
  learning: "Learning & Training Overview",
  succession: "Succession Planning",
  recognition: "Recognition Overview",
  reports: "Department Reports",
  delegated: "Delegated Approvals",
};

export const Route = createFileRoute("/_authenticated/department/$module")({
  component: DepartmentModulePage,
});

function DepartmentModulePage() {
  const { module } = Route.useParams();
  if (module === "competencies") return <CompetencyWorkspace />;
  const title = moduleLabels[module] ?? "Department Workspace";
  return (
    <div className="space-y-6">
      <PageHeader
        breadcrumbs={["Department Workspace", title]}
        title={title}
        description="This workspace is limited to the Department Head's authorized reporting scope."
      />
      <EmptyState
        title={`${title} is not configured`}
        description="This module is reserved in the Department Head navigation but does not yet have an operational workflow."
      />
    </div>
  );
}
