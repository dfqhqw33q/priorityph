import { createFileRoute, useNavigate, useParams } from "@tanstack/react-router";
import { useEffect } from "react";

export const Route = createFileRoute(
  "/_authenticated/reviewing-supervisor/completed/$evaluationId",
)({
  component: function ReviewingSupervisorCompletedRoute() {
    const { evaluationId } = useParams({
      from: "/_authenticated/reviewing-supervisor/completed/$evaluationId",
    });
    const navigate = useNavigate();

    useEffect(() => {
      navigate({
        to: "/reviewing-supervisor/evaluations/$evaluationId",
        params: { evaluationId },
        replace: true,
      });
    }, [evaluationId, navigate]);

    return null;
  },
});
