import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/hr/")({
  beforeLoad: () => {
    throw redirect({ to: "/hr/cycles", replace: true });
  },
  component: () => null,
});
