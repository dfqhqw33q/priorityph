import { createFileRoute, useNavigate, useParams } from "@tanstack/react-router";
import { useEffect } from "react";

export const Route = createFileRoute("/_authenticated/supervisor/completed/$evaluationId")({
  component: function SupervisorCompletedRoute() {
    const { evaluationId } = useParams({
      from: "/_authenticated/supervisor/completed/$evaluationId",
    });
    const navigate = useNavigate();

    useEffect(() => {
      navigate({
        to: "/supervisor/evaluations/$evaluationId",
        params: { evaluationId },
        replace: true,
      });
    }, [evaluationId, navigate]);

    return null;
  },
});
