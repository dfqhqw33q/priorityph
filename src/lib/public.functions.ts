import { createServerFn } from "@tanstack/react-start";

import { employeeProfileSchema, step1SubmissionSchema } from "./schemas";
import type { PublicCycleInfo, Criterion } from "./domain";
import { z } from "zod";

export type PublicCycleResult =
  | { ok: true; cycle: PublicCycleInfo }
  | { ok: false; reason: "INVALID" | "NOT_STARTED" | "EXPIRED" | "CLOSED" };

export const getPublicCycle = createServerFn({ method: "GET" })
  .inputValidator((input: unknown) =>
    z.object({ cycleToken: z.string().min(16).max(128) }).parse(input),
  )
  .handler(async ({ data }): Promise<PublicCycleResult> => {
    const { getAdmin } = await import("./server-core.server");
    const admin = await getAdmin();
    const { data: cycle } = await admin
      .from("evaluation_cycles")
      .select("id, name, year, instructions, status, starts_at, ends_at, template_id")
      .eq("cycle_token", data.cycleToken)
      .maybeSingle();
    if (!cycle) return { ok: false, reason: "INVALID" };
    if (cycle.status !== "ACTIVE") return { ok: false, reason: "CLOSED" };
    const now = Date.now();
    if (now < new Date(cycle.starts_at).getTime()) return { ok: false, reason: "NOT_STARTED" };
    if (now > new Date(cycle.ends_at).getTime()) return { ok: false, reason: "EXPIRED" };

    const { data: criteria } = await admin
      .from("evaluation_criteria")
      .select("id, letter, title, description, position")
      .eq("template_id", cycle.template_id)
      .order("position");

    return {
      ok: true,
      cycle: {
        cycleId: cycle.id,
        name: cycle.name,
        year: cycle.year,
        instructions: cycle.instructions,
        criteria: (criteria ?? []) as Criterion[],
      },
    };
  });

export type Step1Result = { status: "SUBMITTED" | "DUPLICATE" };

export type ProfileVerificationResult =
  | { status: "VERIFIED"; employeeId: string; alreadySubmitted: boolean }
  | { status: "NOT_FOUND" | "INACTIVE" | "DUPLICATE" };

export const verifyEmployeeProfile = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    employeeProfileSchema
      .pick({ employeeNumber: true, firstName: true, lastName: true })
      .extend({ middleName: z.string().max(80).default("") })
      .extend({
        cycleToken: z.string().min(16).max(128),
        deviceSessionId: z.string().min(16).max(128),
      })
      .parse(input),
  )
  .handler(async ({ data }): Promise<ProfileVerificationResult> => {
    const { getAdmin, getRequestMeta, validationError } = await import("./server-core.server");
    const admin = await getAdmin();
    const meta = getRequestMeta();
    if (meta.ip) {
      const { count } = await admin
        .from("public_submission_attempts")
        .select("id", { count: "exact", head: true })
        .eq("ip_address", meta.ip)
        .gte("occurred_at", new Date(Date.now() - 15 * 60_000).toISOString());
      if ((count ?? 0) >= 20) throw validationError("Too many attempts. Please try again later.");
    }
    const { data: employee } = await admin
      .from("employees")
      .select("id, first_name, middle_name, last_name, employment_status")
      .eq("employee_number", data.employeeNumber)
      .maybeSingle();
    if (!employee) {
      await admin
        .from("public_submission_attempts")
        .insert({
          attempt_type: "VERIFICATION",
          outcome: "DENIED",
          device_session_id: data.deviceSessionId,
          ip_address: meta.ip,
          user_agent: meta.userAgent,
        } as never);
      return { status: "NOT_FOUND" };
    }
    if (employee.employment_status !== "ACTIVE") return { status: "INACTIVE" };
    const normalize = (value: string) => value.trim().toLocaleLowerCase();
    if (
      normalize(employee.first_name) !== normalize(data.firstName) ||
      (data.middleName && normalize(employee.middle_name) !== normalize(data.middleName)) ||
      normalize(employee.last_name) !== normalize(data.lastName)
    ) {
      await admin
        .from("public_submission_attempts")
        .insert({
          employee_id: employee.id,
          attempt_type: "VERIFICATION",
          outcome: "DENIED",
          device_session_id: data.deviceSessionId,
          ip_address: meta.ip,
          user_agent: meta.userAgent,
        } as never);
      return { status: "NOT_FOUND" };
    }
    const { data: cycle } = await admin
      .from("evaluation_cycles")
      .select("id")
      .eq("cycle_token", data.cycleToken)
      .maybeSingle();
    const { data: existing } = cycle
      ? await admin
          .from("evaluations")
          .select("id")
          .eq("cycle_id", cycle.id)
          .eq("employee_id", employee.id)
          .maybeSingle()
      : { data: null };
    if (existing) return { status: "DUPLICATE" };
    await admin
      .from("public_submission_attempts")
      .insert({
        cycle_id: cycle?.id ?? null,
        employee_id: employee.id,
        attempt_type: "VERIFICATION",
        outcome: "SUCCESS",
        device_session_id: data.deviceSessionId,
        ip_address: meta.ip,
        user_agent: meta.userAgent,
      } as never);
    return { status: "VERIFIED", employeeId: employee.id, alreadySubmitted: false };
  });

export const submitStep1 = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => step1SubmissionSchema.parse(input))
  .handler(async ({ data }): Promise<Step1Result> => {
    const { getAdmin, writeAudit, getRequestMeta, validationError } =
      await import("./server-core.server");
    const admin = await getAdmin();
    const meta = getRequestMeta();
    if (meta.ip) {
      const { count } = await admin
        .from("public_submission_attempts")
        .select("id", { count: "exact", head: true })
        .eq("ip_address", meta.ip)
        .gte("occurred_at", new Date(Date.now() - 15 * 60_000).toISOString());
      if ((count ?? 0) >= 20) throw validationError("Too many attempts. Please try again later.");
    }

    const { data: cycle } = await admin
      .from("evaluation_cycles")
      .select("id, status, starts_at, ends_at, template_id")
      .eq("cycle_token", data.cycleToken)
      .maybeSingle();
    if (!cycle) throw validationError("This evaluation link is no longer available");
    const now = Date.now();
    if (
      cycle.status !== "ACTIVE" ||
      now < new Date(cycle.starts_at).getTime() ||
      now > new Date(cycle.ends_at).getTime()
    ) {
      throw validationError("This evaluation link is no longer accepting responses");
    }

    const { data: criteria } = await admin
      .from("evaluation_criteria")
      .select("id")
      .eq("template_id", cycle.template_id);
    const validIds = new Set((criteria ?? []).map((c) => c.id));
    if (
      validIds.size !== data.ratings.length ||
      data.ratings.some((r) => !validIds.has(r.criterionId))
    ) {
      throw validationError("Please rate every factor exactly once");
    }

    // Master employee records are created only by authorized administrators.
    const { data: employee } = await admin
      .from("employees")
      .select(
        "id, first_name, middle_name, last_name, full_name, job_title, division, section, employment_status",
      )
      .eq("employee_number", data.employeeNumber)
      .maybeSingle();
    if (!employee || employee.employment_status !== "ACTIVE")
      throw validationError(
        "Employee profile could not be verified. Please contact the System Administrator.",
      );
    const normalize = (value: string) => value.trim().toLocaleLowerCase();
    if (
      normalize(employee.first_name) !== normalize(data.firstName) ||
      normalize(employee.middle_name) !== normalize(data.middleName) ||
      normalize(employee.last_name) !== normalize(data.lastName)
    )
      throw validationError(
        "Employee profile could not be verified. Please contact the System Administrator.",
      );
    const employeeId = employee.id;

    const { data: existing } = await admin
      .from("evaluations")
      .select("id")
      .eq("cycle_id", cycle.id)
      .eq("employee_id", employeeId)
      .maybeSingle();
    if (existing) {
      await admin
        .from("public_submission_attempts")
        .insert({
          cycle_id: cycle.id,
          employee_id: employeeId,
          submission_id: data.submissionId,
          device_session_id: data.deviceSessionId,
          attempt_type: "SUBMISSION",
          outcome: "DUPLICATE",
          ip_address: meta.ip,
          user_agent: meta.userAgent,
        } as never);
      await writeAudit(
        {
          action: "STEP1_DUPLICATE_ATTEMPT",
          module: "Step 1 Submission",
          entityType: "employee",
          entityId: employeeId,
          employeeId,
          newValue: { employee_number: data.employeeNumber, submission_id: data.submissionId },
          result: "DENIED",
        },
        meta,
      );
      return { status: "DUPLICATE" };
    }

    const { data: evaluation, error: evalError } = await admin
      .from("evaluations")
      .insert({
        cycle_id: cycle.id,
        employee_id: employeeId,
        status: "EMPLOYEE_SUBMITTED",
        employee_number_snapshot: data.employeeNumber,
        full_name_snapshot: employee.full_name,
        job_title_snapshot: employee.job_title,
        division_snapshot: employee.division,
        section_snapshot: employee.section,
        employee_submitted_at: new Date().toISOString(),
      })
      .select("id")
      .single();

    if (evalError && evalError.code !== "23505")
      throw validationError("Could not save your evaluation, please try again");
    if (evalError || !evaluation) {
      await writeAudit(
        {
          action: "STEP1_DUPLICATE_ATTEMPT",
          module: "Step 1 Submission",
          entityType: "employee",
          entityId: employeeId,
          employeeId,
          newValue: { employee_number: data.employeeNumber, submission_id: data.submissionId },
          result: "DENIED",
        },
        meta,
      );
      return { status: "DUPLICATE" };
    }

    const signatureData = data.signature.data;
    if (!signatureData.startsWith("data:image/"))
      throw validationError("A valid signature image is required");
    let storagePath: string | null = null;
    let inlineSignature: string | null = signatureData;
    if (data.signature.method === "UPLOAD") {
      const match = signatureData.match(/^data:(image\/(?:png|jpeg));base64,([A-Za-z0-9+/=]+)$/);
      if (!match) throw validationError("Signature upload must be a PNG or JPEG image");
      const contentType = String(match[1]);
      const encoded = String(match[2]);
      const bytes = Uint8Array.from(atob(encoded), (character) => character.charCodeAt(0));
      storagePath = `employees/${employeeId}/signatures/${evaluation.id}.png`;
      const { error } = await admin.storage
        .from("employee-files")
        .upload(storagePath, bytes, { contentType, upsert: false });
      if (error) throw validationError("Could not securely store the signature");
      inlineSignature = null;
    }
    const { error: signatureError } = await admin
      .from("employee_signatures")
      .insert({
        evaluation_id: evaluation.id,
        employee_id: employeeId,
        method: data.signature.method,
        storage_path: storagePath,
        signature_data: inlineSignature,
        content_type: data.signature.contentType,
        file_size: signatureData.length,
        source_version: 1,
      } as never);
    if (signatureError) {
      await admin.from("evaluations").delete().eq("id", evaluation.id);
      throw validationError("Could not record your signature");
    }

    const { error: ratingError } = await admin.from("evaluation_ratings").insert(
      data.ratings.map((r) => ({
        evaluation_id: evaluation.id,
        criterion_id: r.criterionId,
        evaluator_type: "EMPLOYEE" as const,
        rating: r.rating,
        is_locked: true,
      })),
    );
    if (ratingError) {
      await admin.from("evaluations").delete().eq("id", evaluation.id);
      throw validationError("Could not record your ratings, please try again");
    }

    await admin.from("evaluation_events").insert({
      evaluation_id: evaluation.id,
      event_type: "STEP1_SUBMITTED",
      to_status: "EMPLOYEE_SUBMITTED",
    });
    await admin.from("notification_events").insert({
      evaluation_id: evaluation.id,
      cycle_id: cycle.id,
      event_type: "STEP1_SUBMITTED",
      audience_permission: "evaluations.step2",
      title: "Employee evaluation submitted",
      body: "A Step 1 evaluation is ready for Rater Step 2.",
      dedupe_key: `${evaluation.id}:STEP1_SUBMITTED`,
    } as never);
    await admin
      .from("public_submission_attempts")
      .insert({
        cycle_id: cycle.id,
        employee_id: employeeId,
        submission_id: data.submissionId,
        device_session_id: data.deviceSessionId,
        attempt_type: "SUBMISSION",
        outcome: "SUCCESS",
        ip_address: meta.ip,
        user_agent: meta.userAgent,
      } as never);

    await writeAudit(
      {
        action: "STEP1_SUBMITTED",
        module: "Step 1 Submission",
        entityType: "evaluation",
        entityId: evaluation.id,
        employeeId,
        evaluationId: evaluation.id,
        newValue: { employee_number: data.employeeNumber, submission_id: data.submissionId },
      },
      meta,
    );

    return { status: "SUBMITTED" };
  });
