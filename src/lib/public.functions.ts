import { createServerFn } from "@tanstack/react-start";

import { step1SubmissionSchema } from "./schemas";
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

export const submitStep1 = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => step1SubmissionSchema.parse(input))
  .handler(async ({ data }): Promise<Step1Result> => {
    const { getAdmin, writeAudit, getRequestMeta, validationError } = await import(
      "./server-core.server"
    );
    const admin = await getAdmin();
    const meta = getRequestMeta();

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
    if (validIds.size !== data.ratings.length || data.ratings.some((r) => !validIds.has(r.criterionId))) {
      throw validationError("Please rate every factor exactly once");
    }

    // Employee records are permanent: match by employee number, create when new.
    let employeeId: string | null = null;
    const { data: employee } = await admin
      .from("employees")
      .select("id, full_name")
      .eq("employee_number", data.employeeNumber)
      .maybeSingle();

    if (employee) {
      employeeId = employee.id;
      await admin
        .from("employees")
        .update({
          full_name: data.fullName,
          job_title: data.jobTitle,
          division: data.division,
          section: data.section,
        })
        .eq("id", employeeId);
    } else {
      const { data: created, error } = await admin
        .from("employees")
        .insert({
          employee_number: data.employeeNumber,
          full_name: data.fullName,
          job_title: data.jobTitle,
          division: data.division,
          section: data.section,
        })
        .select("id")
        .single();
      if (error || !created) {
        const { data: retry } = await admin
          .from("employees")
          .select("id")
          .eq("employee_number", data.employeeNumber)
          .maybeSingle();
        if (!retry) throw validationError("Could not save your details, please try again");
        employeeId = retry.id;
      } else {
        employeeId = created.id;
        await writeAudit(
          {
            action: "EMPLOYEE_CREATED",
            module: "Employees",
            entityType: "employee",
            entityId: employeeId,
            employeeId,
            newValue: { employee_number: data.employeeNumber, full_name: data.fullName },
          },
          meta,
        );
      }
    }

    const { data: evaluation, error: evalError } = await admin
      .from("evaluations")
      .insert({
        cycle_id: cycle.id,
        employee_id: employeeId,
        status: "EMPLOYEE_SUBMITTED",
        employee_number_snapshot: data.employeeNumber,
        full_name_snapshot: data.fullName,
        job_title_snapshot: data.jobTitle,
        division_snapshot: data.division,
        section_snapshot: data.section,
        employee_submitted_at: new Date().toISOString(),
      })
      .select("id")
      .single();

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
