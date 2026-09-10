import { createFileRoute } from "@tanstack/react-router";

import { EmployeeRecordsPage } from "@/features/employee-management/components/employee-records";

export const Route = createFileRoute("/_authenticated/president/employees")({
  head: () => ({
    meta: [
      { title: "Employee records | Priority Handling Logistics, Inc." },
      {
        name: "description",
        content: "Review employee records and completed evaluations.",
      },
      { property: "og:title", content: "Employee records — HR" },
      { property: "og:description", content: "Employee records and completed evaluations." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: EmployeeRecordsPage,
});
