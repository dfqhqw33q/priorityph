import { createFileRoute } from "@tanstack/react-router";

import { EmployeeRecordsPage } from "@/components/employee-records";

export const Route = createFileRoute("/_authenticated/admin/employees")({
  head: () => ({
    meta: [
      { title: "Employee records | Priority Handling Logistics, Inc." },
      {
        name: "description",
        content: "Permanent employee records created from Step 1 submissions, with evaluation history.",
      },
      { property: "og:title", content: "Employee records" },
      { property: "og:description", content: "Read-only permanent employee registry and history." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: EmployeeRecordsPage,
});
