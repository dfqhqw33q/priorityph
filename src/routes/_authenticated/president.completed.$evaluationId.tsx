import { createFileRoute, useNavigate, useParams } from "@tanstack/react-router";
import { useEffect } from "react";

export const Route = createFileRoute("/_authenticated/president/completed/$evaluationId")({
  component: function PresidentCompletedRoute() {
    const { evaluationId } = useParams({
      from: "/_authenticated/president/completed/$evaluationId",
    });
    const navigate = useNavigate();

    useEffect(() => {
      navigate({
        to: "/president/evaluations/$evaluationId",
        params: { evaluationId },
        replace: true,
      });
    }, [evaluationId, navigate]);

    return null;
  },
});
