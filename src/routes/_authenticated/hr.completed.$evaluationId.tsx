import { createFileRoute, useNavigate, useParams } from "@tanstack/react-router";
import { useEffect } from "react";

export const Route = createFileRoute("/_authenticated/hr/completed/$evaluationId")({
  component: function HrCompletedRoute() {
    const { evaluationId } = useParams({
      from: "/_authenticated/hr/completed/$evaluationId",
    });
    const navigate = useNavigate();

    useEffect(() => {
      navigate({
        to: "/personnel/evaluations/$evaluationId",
        params: { evaluationId },
        replace: true,
      });
    }, [evaluationId, navigate]);

    return null;
  },
});
