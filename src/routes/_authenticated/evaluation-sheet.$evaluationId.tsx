import { createFileRoute } from "@tanstack/react-router";
import { json } from "@tanstack/react-start";
import { getAdmin } from "@/lib/server-core.server";
import { generateEvaluationData, generateEvaluationHTML } from "@/lib/documents.server";

export const Route = createFileRoute("/_authenticated/evaluation-sheet/$evaluationId")({
  beforeLoad: async ({ params }) => {
    const { evaluationId } = params;
    const admin = await getAdmin();

    // Verify the user has access to this evaluation
    const { data: evaluation } = await admin
      .from("evaluations")
      .select("id, employee_id, status")
      .eq("id", evaluationId)
      .maybeSingle();

    if (!evaluation) {
      throw new Error("Evaluation not found");
    }

    if (evaluation.status !== "FINALIZED") {
      throw new Error("Finalized evaluation document is unavailable because the evaluation is not finalized.");
    }

    // Generate the HTML
    const data = await generateEvaluationData(evaluationId);
    const html = generateEvaluationHTML(data);

    // Return as HTML response
    return new Response(html, {
      status: 200,
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Content-Disposition": "inline",
        "Cache-Control": "public, max-age=3600",
      },
    });
  },
  component: () => null, // This route only serves HTML responses
});
