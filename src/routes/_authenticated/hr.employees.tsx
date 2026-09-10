import { createFileRoute } from "@tanstack/react-router";

import { EmployeeRecordsPage } from "@/features/employee-management/components/employee-records";

export const Route = createFileRoute("/_authenticated/hr/employees")({
  head: () => ({
    meta: [
      { title: "Digital 201 files | Priority Handling Logistics, Inc." },
      {
        name: "description",
        content: "Review employee records and evaluation history.",
      },
    ],
  }),
  component: EmployeeRecordsPage,
});
