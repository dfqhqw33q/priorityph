import { createFileRoute } from "@tanstack/react-router";

import { EmployeeProfileManagementPage } from "@/components/employee-profile-management";

export const Route = createFileRoute("/_authenticated/admin/employee-profiles")({
  head: () => ({
    meta: [
      { title: "Employee profile management | Priority Handling Logistics, Inc." },
      { name: "description", content: "Create and maintain verified employee master profiles." },
    ],
  }),
  component: EmployeeProfileManagementPage,
});
