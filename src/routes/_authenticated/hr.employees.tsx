import { createFileRoute } from "@tanstack/react-router";

import { EmployeeRecordsPage } from "@/components/employee-records";

export const Route = createFileRoute("/_authenticated/hr/employees")({
  head: () => ({
    meta: [
      { title: "Digital 201 files | Priority Handling Logistics, Inc." },
      {
        name: "description",
        content: "Authorized employee Digital 201 Files and evaluation history.",
      },
    ],
  }),
  component: EmployeeRecordsPage,
});
