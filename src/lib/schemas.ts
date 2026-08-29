import { z } from "zod";

import { APP_ROLES, CYCLE_STATUSES, EVALUATION_STATUSES, PERMISSIONS } from "./domain";

const trimmed = (min: number, max: number) =>
  z
    .string()
    .transform((value) => value.trim())
    .pipe(z.string().min(min).max(max));

export const ratingValueSchema = z
  .number({ invalid_type_error: "Select a rating" })
  .int("Ratings must be whole numbers")
  .min(1)
  .max(5);

export const ratingEntrySchema = z.object({
  criterionId: z.string().uuid(),
  rating: ratingValueSchema,
});

export const employeeInfoSchema = z.object({
  employeeNumber: trimmed(1, 40),
  firstName: trimmed(1, 80),
  middleName: trimmed(0, 80),
  lastName: trimmed(1, 80),
  jobTitle: trimmed(2, 160),
  division: trimmed(2, 160),
  section: trimmed(2, 160),
});

export const step1SubmissionSchema = employeeInfoSchema.extend({
  cycleToken: z.string().min(16).max(128),
  submissionId: z.string().uuid(),
  deviceSessionId: z.string().min(16).max(128),
  ratings: z.array(ratingEntrySchema).length(10),
  signature: z.object({
    method: z.enum(["UPLOAD", "DRAWN"]),
    data: z.string().min(32).max(700_000),
    contentType: z.string().max(80).default("image/png"),
  }),
});
export type Step1Submission = z.infer<typeof step1SubmissionSchema>;

export const step1FormSchema = employeeInfoSchema.extend({
  deviceSessionId: z.string().min(16).max(128),
  ratings: z.record(z.string().uuid(), ratingValueSchema),
  signature: z.object({
    method: z.enum(["UPLOAD", "DRAWN"]),
    data: z.string().min(32).max(700_000),
    contentType: z.string().max(80).default("image/png"),
  }),
});

export const employeeProfileSchema = z.object({
  employeeNumber: trimmed(1, 40),
  firstName: trimmed(1, 80),
  middleName: trimmed(0, 80),
  lastName: trimmed(1, 80),
  jobTitle: z.string().max(160).default(""),
  division: z.string().max(160).default(""),
  section: z.string().max(160).default(""),
});
export type EmployeeProfileValues = z.infer<typeof employeeProfileSchema>;

export const cycleFormSchema = z
  .object({
    name: trimmed(3, 160),
    year: z.coerce.number().int().min(2000).max(2200),
    templateId: z.string().uuid(),
    instructions: z.string().max(4000).default(""),
    startsAt: z.string().min(1, "Start date and time is required"),
    endsAt: z.string().min(1, "End date and time is required"),
  })
  .refine((value) => new Date(value.endsAt) > new Date(value.startsAt), {
    message: "End must be after start",
    path: ["endsAt"],
  });
export type CycleFormValues = z.infer<typeof cycleFormSchema>;

export const reasonSchema = trimmed(5, 500);

export const cycleStatusActionSchema = z.object({
  cycleId: z.string().uuid(),
  status: z.enum(CYCLE_STATUSES),
  reason: reasonSchema,
});

export const supervisorDraftSchema = z.object({
  evaluationId: z.string().uuid(),
  version: z.number().int().positive(),
  remarks: z.string().max(2000).default(""),
  ratings: z.array(ratingEntrySchema).max(10),
});

export const supervisorSubmitSchema = z.object({
  evaluationId: z.string().uuid(),
  version: z.number().int().positive(),
  remarks: z.string().max(2000).default(""),
  ratings: z.array(ratingEntrySchema).length(10),
});

export const raterStep2Schema = z
  .object({
    evaluationId: z.string().uuid(),
    version: z.number().int().positive(),
    ratings: z.array(ratingEntrySchema).max(10).default([]),
    remarks: z.string().max(2000).default(""),
    strengths: z.string().max(4000).default(""),
    weaknesses: z.string().max(4000).default(""),
    development: z.string().max(4000).default(""),
    advancement: z.string().max(4000).default(""),
    careerTransfer: z.string().max(4000).default(""),
    recommendations: z.string().max(4000).default(""),
    submit: z.boolean().default(false),
    signature: z
      .object({
        method: z.enum(["DRAWN", "UPLOAD", "TYPED"]),
        data: z.string().min(2).max(700_000),
      })
      .optional(),
  })
  .superRefine((value, context) => {
    if (!value.submit) return;
    for (const [key, label] of [
      ["strengths", "Strengths"],
      ["weaknesses", "Weaknesses"],
      ["development", "Development"],
      ["advancement", "Advancement"],
      ["careerTransfer", "Career / transfer"],
      ["recommendations", "Other recommendations"],
    ] as const) {
      if (!value[key].trim())
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: [key],
          message: `${label} is required`,
        });
    }
  });

export const reviewingSupervisorReviewSchema = z
  .object({
    evaluationId: z.string().uuid(),
    version: z.number().int().positive(),
    comments: z.string().max(4000).default(""),
    recommendations: z.string().max(4000).default(""),
    submit: z.boolean().default(false),
    signature: z
      .object({
        method: z.enum(["DRAWN", "UPLOAD", "TYPED"]),
        data: z.string().min(2).max(700_000),
      })
      .optional(),
  })
  .superRefine((value, context) => {
    if (value.submit && !value.comments.trim())
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["comments"],
        message: "Comments are required",
      });
    if (value.submit && !value.recommendations.trim())
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["recommendations"],
        message: "Recommendations are required",
      });
  });

export const personnelProcessingSchema = z
  .object({
    evaluationId: z.string().uuid(),
    version: z.number().int().positive(),
    presentSalary: z.number().nonnegative().nullable().default(null),
    lastIncreaseDate: z.string().max(20).nullable().default(null),
    lastIncreaseNature: z.string().max(1000).default(""),
    lastIncreaseAmount: z.number().nonnegative().nullable().default(null),
    totalPoints: z.number().nonnegative().nullable().default(null),
    adjectiveRating: z.string().max(160).default(""),
    recommendedIncreaseBonus: z.string().max(2000).default(""),
    submit: z.boolean().default(false),
    signature: z
      .object({
        method: z.enum(["DRAWN", "UPLOAD", "TYPED"]),
        data: z.string().min(2).max(700_000),
      })
      .optional(),
  })
  .superRefine((value, context) => {
    if (!value.submit) return;
    if (value.presentSalary === null)
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["presentSalary"],
        message: "Present salary is required",
      });
    if (value.totalPoints === null)
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["totalPoints"],
        message: "Total points are required",
      });
    if (!value.adjectiveRating.trim())
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["adjectiveRating"],
        message: "Adjective rating is required",
      });
    if (!value.recommendedIncreaseBonus.trim())
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["recommendedIncreaseBonus"],
        message: "Increase or bonus recommendation is required",
      });
  });

export const committeeReviewSchema = z
  .object({
    evaluationId: z.string().uuid(),
    version: z.number().int().positive(),
    finalAction: z.enum([
      "RETAIN",
      "TRANSFER",
      "PROMOTE",
      "INCREASE_SALARY",
      "TRAINING_REQUIRED",
      "OTHER",
    ]),
    actionDetails: z.string().max(2000).default(""),
    recommendation: z.string().max(4000).default(""),
    submit: z.boolean().default(false),
    signature: z
      .object({
        method: z.enum(["DRAWN", "UPLOAD", "TYPED"]),
        data: z.string().min(2).max(700_000),
      })
      .optional(),
  })
  .superRefine((value, context) => {
    if (value.submit && !value.recommendation.trim())
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["recommendation"],
        message: "Committee recommendation is required",
      });
    if (value.submit && value.finalAction === "OTHER" && !value.actionDetails.trim())
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["actionDetails"],
        message: "Action details are required for Other",
      });
  });

export const correctionStageSchema = z.enum([
  "SUPERVISOR_DRAFT",
  "REVIEWING_SUPERVISOR_REVIEW",
  "PERSONNEL_PROCESSING",
  "COMMITTEE_REVIEW",
]);

export const presidentApprovalSchema = z.object({
  evaluationId: z.string().uuid(),
  version: z.number().int().positive(),
  approve: z.boolean(),
  reason: z.string().trim().max(500).default(""),
  correctionStage: correctionStageSchema.optional(),
  signature: z
    .object({ method: z.enum(["DRAWN", "UPLOAD", "TYPED"]), data: z.string().min(2).max(700_000) })
    .optional(),
});

export const reopenSchema = z.object({
  evaluationId: z.string().uuid(),
  reason: reasonSchema,
});

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8, "Password must be at least 8 characters"),
});

export const forgotPasswordSchema = z.object({ email: z.string().email() });

export const resetPasswordSchema = z
  .object({
    password: z.string().min(10, "Use at least 10 characters"),
    confirmPassword: z.string(),
  })
  .refine((v) => v.password === v.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });

export const userFormSchema = z.object({
  email: z.string().email(),
  fullName: trimmed(2, 160),
  jobTitle: z.string().max(160).default(""),
  // Exactly one role per internal user.
  roles: z.array(z.enum(APP_ROLES)).length(1, "Select exactly one role"),
});
export type UserFormValues = z.infer<typeof userFormSchema>;

export const userUpdateSchema = z.object({
  userId: z.string().uuid(),
  fullName: trimmed(2, 160),
  jobTitle: z.string().max(160).default(""),
});

export const userAccessActionSchema = z.object({
  userId: z.string().uuid(),
  action: z.enum([
    "ACTIVATE",
    "DEACTIVATE",
    "LOCK",
    "UNLOCK",
    "RESET_PASSWORD",
    "REQUIRE_PASSWORD_CHANGE",
    "REVOKE_SESSIONS",
  ]),
  reason: reasonSchema,
});

export const assignRolesSchema = z.object({
  userId: z.string().uuid(),
  // A user may hold exactly one role; assigning a role replaces the previous one.
  roles: z.array(z.enum(APP_ROLES)).length(1, "Select exactly one role"),
  reason: reasonSchema,
});

export const rolePermissionsSchema = z.object({
  role: z.enum(APP_ROLES),
  permissions: z.array(z.enum(PERMISSIONS)),
  reason: reasonSchema,
});

export const bootstrapAdminSchema = z.object({
  email: z.string().email(),
  fullName: trimmed(2, 160),
  password: z.string().min(10, "Use at least 10 characters"),
});

export const queueFiltersSchema = z.object({
  search: z.string().max(120).default(""),
  year: z.number().int().min(2000).max(2200).nullable().default(null),
  division: z.string().max(160).default(""),
  section: z.string().max(160).default(""),
  status: z.enum(EVALUATION_STATUSES).nullable().default(null),
});
export type QueueFiltersValues = z.infer<typeof queueFiltersSchema>;

export const presidentStepSchema = z.union([z.literal(2), z.literal(3)]);

export const presidentAnswerSchema = z.object({
  itemId: z.string().uuid(),
  value: z.string().max(4000),
});

export const presidentStepSaveSchema = z.object({
  evaluationId: z.string().uuid(),
  step: presidentStepSchema,
  version: z.number().int().positive(),
  answers: z.array(presidentAnswerSchema).max(60),
  submit: z.boolean().default(false),
});
export type PresidentStepSaveValues = z.infer<typeof presidentStepSaveSchema>;

export const presidentRatingSaveSchema = z.object({
  evaluationId: z.string().uuid(),
  version: z.number().int().positive(),
  ratings: z.array(ratingEntrySchema).length(10),
});

export const auditFiltersSchema = z.object({
  search: z.string().max(120).default(""),
  from: z.string().max(40).default(""),
  to: z.string().max(40).default(""),
  actor: z.string().max(120).default(""),
  role: z.string().max(40).default(""),
  module: z.string().max(80).default(""),
  action: z.string().max(80).default(""),
  entityType: z.string().max(80).default(""),
  result: z.string().max(20).default(""),
  limit: z.number().int().min(1).max(500).default(200),
});
export type AuditFiltersValues = z.infer<typeof auditFiltersSchema>;

// --------------------------- Phase 8: scoring ------------------------------

export const scoringBandSchema = z
  .object({
    label: trimmed(1, 80),
    minScore: z.coerce.number().min(0).max(100),
    maxScore: z.coerce.number().min(0).max(100),
  })
  .refine((band) => band.maxScore >= band.minScore, {
    message: "Maximum must be greater than or equal to minimum",
    path: ["maxScore"],
  });

export const scoringFactorWeightSchema = z.object({
  criterionId: z.string().uuid(),
  weight: z.coerce.number().min(0).max(1000),
});

export const scoringRuleFormSchema = z.object({
  ruleId: z.string().uuid().optional(),
  name: trimmed(3, 120),
  templateId: z.string().uuid(),
  factorWeighting: z.enum(["EQUAL", "WEIGHTED"]),
  requiredFactorWeightTotal: z.coerce.number().min(1).max(10000).default(100),
  employeeWeight: z.coerce.number().min(0).max(100),
  supervisorWeight: z.coerce.number().min(0).max(100),
  roundingDecimals: z.coerce.number().int().min(0).max(4).default(2),
  showEmployeeAverage: z.boolean().default(true),
  showSupervisorAverage: z.boolean().default(true),
  showPresidentResult: z.boolean().default(false),
  notes: z.string().max(2000).default(""),
  weights: z.array(scoringFactorWeightSchema).max(50).default([]),
  bands: z.array(scoringBandSchema).max(20).default([]),
});
export type ScoringRuleFormValues = z.infer<typeof scoringRuleFormSchema>;

export const finalizeSchema = z.object({
  evaluationId: z.string().uuid(),
  version: z.number().int().positive(),
  reason: z.string().max(500).default(""),
});

export const correctionSchema = z.object({
  evaluationId: z.string().uuid(),
  version: z.number().int().positive(),
  reason: reasonSchema,
});

export const reportFiltersSchema = z.object({
  year: z.number().int().min(2000).max(2200).nullable().default(null),
  cycleId: z.string().uuid().nullable().default(null),
  division: z.string().max(160).default(""),
  section: z.string().max(160).default(""),
  status: z.string().max(40).default(""),
  finalRating: z.string().max(80).default(""),
  search: z.string().max(120).default(""),
  page: z.number().int().min(0).max(10000).default(0),
  pageSize: z.number().int().min(5).max(100).default(25),
});
export type ReportFilters = z.infer<typeof reportFiltersSchema>;
