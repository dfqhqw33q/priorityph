import { createFileRoute } from "@tanstack/react-router";

import { EmployeeRecordsPage } from "@/components/employee-records";

export const Route = createFileRoute("/_authenticated/president/employees")({
  head: () => ({
    meta: [
      { title: "Employee records | Priority Handling Logistics, Inc." },
      {
        name: "description",
        content: "HR view of permanent employee records and their evaluation history.",
      },
      { property: "og:title", content: "Employee records — HR" },
      { property: "og:description", content: "Permanent employee registry maintained by HR / Personnel." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: EmployeeRecordsPage,
});
