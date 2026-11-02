import { createFileRoute } from "@tanstack/react-router";

import { EmptyState, PageHeader } from "@/components/shared/portal-ui";
import { CompetencyWorkspace } from "@/features/competency-management/components/competency-workspace";

const moduleLabels: Record<string, string> = {
  employees: "Employee Management",
  competencies: "Competency Management",
  succession: "Succession Planning",
  recognition: "Social Recognition",
  reports: "HR Reports & Analytics",
};

export const Route = createFileRoute("/_authenticated/hr/$module")({
  component: HrModulePage,
});

function HrModulePage() {
  const { module } = Route.useParams();
  if (module === "competencies") return <CompetencyWorkspace />;
  const title = moduleLabels[module] ?? "HR Workspace";
  return (
    <div className="space-y-6">
      <PageHeader
        breadcrumbs={["HR Administrator", title]}
        title={title}
        description="This role-controlled workspace is available in the HR Administrator portal."
      />
      <EmptyState
        title={`${title} is not configured`}
        description="This module is reserved in the HR navigation but does not yet have an operational workflow."
      />
    </div>
  );
}
