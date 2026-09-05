import { createFileRoute } from "@tanstack/react-router";

import { EmployeeRecordsPage } from "@/components/employee-records";

export const Route = createFileRoute("/_authenticated/admin/employees")({
  head: () => ({
    meta: [
      { title: "Employee records | Priority Handling Logistics, Inc." },
      {
        name: "description",
        content: "Permanent employee records maintained by the System Administrator.",
      },
      { property: "og:title", content: "Employee records" },
      { property: "og:description", content: "Read-only permanent employee registry." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => <EmployeeRecordsPage allow201={false} />,
});
