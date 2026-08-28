import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

import { getAdmin, validationError } from "./server-core.server";

export type EmployeeDocumentCategory =
  | "PERFORMANCE_EVALUATIONS"
  | "AWARDS_RECOGNITION"
  | "TRAINING_CERTIFICATES"
  | "SUPPORTING_DOCUMENTS"
  | "OTHER_DOCUMENTS";

function wrap(text: string, max = 92): string[] {
  const words = text.replace(/\s+/g, " ").trim().split(" ");
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    if (`${line} ${word}`.trim().length > max && line) {
      lines.push(line);
      line = word;
    } else line = `${line} ${word}`.trim();
  }
  if (line) lines.push(line);
  return lines.length ? lines : [""];
}

export async function createFinalEvaluationDocument(evaluationId: string, userId: string) {
  const admin = await getAdmin();
  const { data: evaluation } = await admin
    .from("evaluations")
    .select("id, employee_id, employee_number_snapshot, full_name_snapshot, job_title_snapshot, division_snapshot, section_snapshot, status, finalized_at, cycle_id, evaluation_cycles(name, year)")
    .eq("id", evaluationId)
    .maybeSingle();
  if (!evaluation) throw validationError("Evaluation not found");
  const cycle = (evaluation as never as { evaluation_cycles: { name: string; year: number } }).evaluation_cycles;
  const [{ data: criteria }, { data: ratings }, { data: score }, { data: signature }] = await Promise.all([
    admin.from("evaluation_criteria").select("id, letter, title").eq("template_id", (await admin.from("evaluation_cycles").select("template_id").eq("id", evaluation.cycle_id).single()).data?.template_id ?? "").order("position"),
    admin.from("evaluation_ratings").select("criterion_id, evaluator_type, rating").eq("evaluation_id", evaluationId),
    admin.from("evaluation_scores").select("final_score, final_rating_label, president_average, rule_version").eq("evaluation_id", evaluationId).maybeSingle(),
    admin.from("employee_signatures").select("method, storage_path, signature_data, content_type, signed_at").eq("evaluation_id", evaluationId).maybeSingle(),
  ]);

  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  let page = pdf.addPage([612, 792]);
  let y = 750;
  const draw = (text: string, size = 10, isBold = false) => {
    if (y < 52) { page = pdf.addPage([612, 792]); y = 750; }
    page.drawText(text, { x: 42, y, size, font: isBold ? bold : font, color: rgb(0.05, 0.08, 0.16) });
    y -= size + 5;
  };
  const rule = () => { page.drawLine({ start: { x: 42, y }, end: { x: 570, y }, thickness: 0.6, color: rgb(0.7, 0.72, 0.76) }); y -= 14; };

  draw("PRIORITY HANDLING LOGISTICS, INC.", 16, true);
  draw("FINAL PERFORMANCE EVALUATION", 13, true);
  draw(`${cycle.name} (${cycle.year})`, 10);
  rule();
  draw(`Employee number: ${evaluation.employee_number_snapshot}`);
  draw(`Employee name: ${evaluation.full_name_snapshot}`);
  draw(`Job title: ${evaluation.job_title_snapshot}`);
  draw(`Division / section: ${evaluation.division_snapshot} / ${evaluation.section_snapshot}`);
  draw(`Finalized: ${evaluation.finalized_at ?? new Date().toISOString()}`);
  rule();
  draw("PERFORMANCE EVALUATION FACTORS", 12, true);
  for (const criterion of criteria ?? []) {
    const factor = (ratings ?? []).filter((item) => item.criterion_id === criterion.id);
    const value = (type: string) => factor.find((item) => item.evaluator_type === type)?.rating ?? "-";
    draw(`${criterion.letter}. ${criterion.title}: Employee ${value("EMPLOYEE")}   Supervisor ${value("SUPERVISOR")}   President ${value("PRESIDENT")}`);
  }
  rule();
  draw(`President average / Overall final score: ${score?.final_score ?? "-"}`, 12, true);
  draw(`Final rating: ${score?.final_rating_label ?? "-"}`);
  draw(`Scoring rule version: ${score?.rule_version ?? "-"}`);
  draw("This document represents the finalized, locked evaluation record.", 9);
  if (signature) {
    draw("RATEE SIGNATURE", 10, true);
    try {
      let signatureBytes: Uint8Array;
      if (signature.method === "UPLOAD" && signature.storage_path) {
        const { data: blob, error } = await admin.storage.from("employee-files").download(signature.storage_path);
        if (error || !blob) throw validationError("Could not load ratee signature");
        signatureBytes = new Uint8Array(await blob.arrayBuffer());
      } else if (signature.signature_data) {
        const base64 = signature.signature_data.split(",")[1];
        signatureBytes = Uint8Array.from(atob(base64), (character) => character.charCodeAt(0));
      } else throw validationError("Ratee signature is unavailable");
      const image = signature.content_type === "image/jpeg" ? await pdf.embedJpg(signatureBytes) : await pdf.embedPng(signatureBytes);
      page.drawImage(image, { x: 42, y: Math.max(y - 60, 70), width: 180, height: 45 });
      y = Math.max(y - 75, 55);
      draw(`Signed on: ${signature.signed_at ?? ""}`, 9);
      draw(`Printed name: ${evaluation.full_name_snapshot}`, 9);
    } catch (error) {
      console.error("[documents] ratee signature omitted", error);
    }
  }

  const bytes = await pdf.save();
  const path = `employees/${evaluation.employee_id}/evaluations/${cycle.year}-evaluation.pdf`;
  const { error: uploadError } = await admin.storage.from("employee-files").upload(path, bytes, { contentType: "application/pdf", upsert: true });
  if (uploadError) throw validationError(uploadError.message);
  const { data: document, error } = await admin.from("employee_documents").upsert({ employee_id: evaluation.employee_id, evaluation_id: evaluationId, category: "PERFORMANCE_EVALUATIONS", file_name: `${cycle.year} Evaluation.pdf`, storage_path: path, content_type: "application/pdf", file_size: bytes.length, created_by: userId }, { onConflict: "storage_path" }).select().single();
  if (error) throw validationError(error.message);
  return document;
}
