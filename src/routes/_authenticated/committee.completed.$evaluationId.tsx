import { createFileRoute, useNavigate, useParams } from "@tanstack/react-router";
import { useEffect } from "react";

export const Route = createFileRoute("/_authenticated/committee/completed/$evaluationId")({
  component: function CommitteeCompletedRoute() {
    const { evaluationId } = useParams({
      from: "/_authenticated/committee/completed/$evaluationId",
    });
    const navigate = useNavigate();

    useEffect(() => {
      navigate({
        to: "/committee/evaluations/$evaluationId",
        params: { evaluationId },
        replace: true,
      });
    }, [evaluationId, navigate]);

    return null;
  },
});
