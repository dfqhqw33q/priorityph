export type RatingScale = {
  value: 1 | 2 | 3 | 4 | 5;
  label: string;
  description: string;
};

export type TemplateCategory = {
  id: string;
  name: string;
  weight: number;
  indicators: string[];
  evidence: string[];
};

export type EvaluationCategoryScore = {
  categoryId: string;
  rating: number | null;
  weight: number;
  weightedContribution: number | null;
};

export type EvaluationScore = {
  score: number | null;
  categoryScores: EvaluationCategoryScore[];
  missingCategoryIds: string[];
  invalidCategoryIds: string[];
  weightTotal: number;
  templateValid: boolean;
};

export type EvaluationTemplate = {
  id: string;
  name: string;
  jobPosition: string;
  version: number;
  effectiveDate: string;
  categories: TemplateCategory[];
};

export const RATING_SCALE: RatingScale[] = [
  { value: 1, label: "Poor", description: "Poor / Unacceptable" },
  { value: 2, label: "Below Average", description: "Below Average / Improvement required" },
  { value: 3, label: "Average", description: "Average / Meets expectations" },
  { value: 4, label: "Above Average", description: "Above Average / Often exceeds expectations" },
  { value: 5, label: "Excellent", description: "Excellent / Consistently exceeds expectations" },
];

export const DRIVER_EVALUATION_TEMPLATE: EvaluationTemplate = {
  id: "driver-template-v1",
  name: "Driver Evaluation Template",
  jobPosition: "Driver",
  version: 1,
  effectiveDate: "2026-01-01",
  categories: [
    {
      id: "safety-compliance",
      name: "Safety & Compliance",
      weight: 30,
      indicators: [
        "Follows traffic laws.",
        "Observes safety procedures.",
        "Follows company policies.",
        "Maintains safe driving practices.",
      ],
      evidence: [
        "Safety records.",
        "Inspection records.",
        "Incident reports.",
        "Supervisor observation.",
      ],
    },
    {
      id: "delivery-performance",
      name: "Delivery / Operational Performance",
      weight: 25,
      indicators: [
        "Completes deliveries on time.",
        "Follows assigned routes.",
        "Meets operational requirements.",
        "Handles delivery responsibilities properly.",
      ],
      evidence: ["Dispatch records.", "Delivery records.", "Route records."],
    },
    {
      id: "vehicle-care",
      name: "Vehicle & Equipment Care",
      weight: 10,
      indicators: [
        "Maintains vehicle cleanliness.",
        "Reports defects.",
        "Performs required inspections.",
        "Handles equipment responsibly.",
      ],
      evidence: ["Inspection history.", "Maintenance reports.", "Supervisor evidence."],
    },
    {
      id: "documentation-accuracy",
      name: "Documentation & Accuracy",
      weight: 10,
      indicators: [
        "Completes delivery documents correctly.",
        "Submits accurate reports.",
        "Maintains required records.",
      ],
      evidence: ["Delivery documents.", "Records.", "Exception reports."],
    },
    {
      id: "dependability",
      name: "Dependability",
      weight: 10,
      indicators: [
        "Maintains reliable attendance.",
        "Arrives punctually.",
        "Remains available as scheduled.",
        "Consistently completes assigned duties.",
      ],
      evidence: ["Attendance records.", "Assignment records."],
    },
    {
      id: "customer-service",
      name: "Customer Service & Communication",
      weight: 5,
      indicators: [
        "Communicates professionally.",
        "Handles customer concerns appropriately.",
        "Provides timely updates.",
      ],
      evidence: ["Supervisor evidence.", "Service records where available."],
    },
    {
      id: "teamwork",
      name: "Teamwork & Professionalism",
      weight: 5,
      indicators: [
        "Cooperates with colleagues.",
        "Respects supervisors.",
        "Follows workplace standards.",
      ],
      evidence: ["Supervisor/peer evidence where policy allows."],
    },
    {
      id: "initiative-problem-solving",
      name: "Initiative / Problem Solving",
      weight: 5,
      indicators: [
        "Responds appropriately to unexpected situations.",
        "Identifies problems.",
        "Takes responsible action.",
      ],
      evidence: ["Incident examples.", "Supervisor evidence."],
    },
  ],
};

export function calculateWeightedScore(
  template: EvaluationTemplate,
  ratings: Record<string, number | null | undefined>,
): EvaluationScore {
  const weightTotal = template.categories.reduce((sum, category) => sum + category.weight, 0);
  const templateValid =
    template.categories.length === 8 &&
    template.categories.every(
      (category) =>
        Number.isFinite(category.weight) && category.weight > 0 && category.weight <= 100,
    ) &&
    Math.abs(weightTotal - 100) < 0.0001;
  const missingCategoryIds: string[] = [];
  const invalidCategoryIds: string[] = [];
  let weightedTotal = 0;

  const categoryScores = template.categories.map((category) => {
    const rating = ratings[category.id];
    if (rating === undefined || rating === null) {
      missingCategoryIds.push(category.id);
      return {
        categoryId: category.id,
        rating: null,
        weight: category.weight,
        weightedContribution: null,
      };
    }

    if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
      invalidCategoryIds.push(category.id);
      return {
        categoryId: category.id,
        rating,
        weight: category.weight,
        weightedContribution: null,
      };
    }

    const weightedContribution = Number(((rating * category.weight) / 100).toFixed(2));
    weightedTotal += rating * category.weight;
    return { categoryId: category.id, rating, weight: category.weight, weightedContribution };
  });

  const complete =
    templateValid && missingCategoryIds.length === 0 && invalidCategoryIds.length === 0;

  return {
    score: complete ? Number((weightedTotal / 100).toFixed(2)) : null,
    categoryScores,
    missingCategoryIds,
    invalidCategoryIds,
    weightTotal,
    templateValid,
  };
}
