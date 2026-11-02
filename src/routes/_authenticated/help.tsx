import { createFileRoute } from "@tanstack/react-router";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/shared/portal-ui";
import { useAccess } from "@/hooks/use-access";
import { normalizeRole } from "@/lib/domain";

export const Route = createFileRoute("/_authenticated/help")({
  component: HelpSupportPage,
});

function HelpSupportPage() {
  const { access } = useAccess();
  const isEmployee = (access?.roles ?? []).some((role) => normalizeRole(role) === "EMPLOYEE");

  return (
    <div className="space-y-6">
      <PageHeader
        breadcrumbs={["Help & Support"]}
        title="Help & Support"
        description="Guidance for using the internal performance management portal."
      />
      <Card>
        <CardHeader>
          <CardTitle>Getting help</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-muted-foreground">
          <p>
            {isEmployee
              ? "For questions about your employee information or evaluation assignment, contact your assigned supervisor."
              : "For questions about account access or employee assignments, contact your system support contact."}
          </p>
          <p>
            If your employee profile, department, position, or supervisor is missing or incorrect,
            ask the system owner to update the linked employee record.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
