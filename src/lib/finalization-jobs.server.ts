import { getAdmin } from "./server-core.server";

const JOB_LIMIT = 10;

type ProcessingJob = {
  id: string;
  evaluation_id: string;
  job_type: "DEVELOPMENT" | "TRAINING" | "SUCCESSION" | "RECOGNITION" | "FINALIZED_EMAIL";
};

export async function processFinalizationJobs(): Promise<{
  claimed: number;
  completed: number;
  failed: number;
}> {
  const admin = await getAdmin();
  const { data: jobs, error } = await admin.rpc(
    "claim_evaluation_processing_jobs" as never,
    {
      _limit: JOB_LIMIT,
    } as never,
  );
  if (error) throw error;
  let completed = 0;
  let failed = 0;
  for (const job of (jobs ?? []) as ProcessingJob[]) {
    try {
      if (job.job_type === "DEVELOPMENT") {
        const { ensureDevelopmentRecordsForEvaluation } =
          await import("@/features/learning-management/development.functions");
        await ensureDevelopmentRecordsForEvaluation(job.evaluation_id);
      } else if (job.job_type === "TRAINING") {
        const {
          ensureTrainingRecommendationsForEvaluation,
          ensureTrainingRequirementForCommitteeDecision,
        } = await import("@/features/training-management/training.functions");
        await ensureTrainingRecommendationsForEvaluation(job.evaluation_id);
        await ensureTrainingRequirementForCommitteeDecision(job.evaluation_id);
      } else if (job.job_type === "SUCCESSION") {
        const { ensureSuccessionProfileForEvaluation } =
          await import("@/features/succession-planning/succession.functions");
        await ensureSuccessionProfileForEvaluation(job.evaluation_id);
      } else if (job.job_type === "RECOGNITION") {
        const { ensureRecognitionCandidatesForEvaluation } =
          await import("@/features/social-recognition/recognition.functions");
        await ensureRecognitionCandidatesForEvaluation(job.evaluation_id);
      } else {
        const { queueEmployeeFinalizedStep1Email } = await import("./public.functions");
        await queueEmployeeFinalizedStep1Email(job.evaluation_id);
      }
      await admin.rpc(
        "finish_evaluation_processing_job" as never,
        {
          _job_id: job.id,
          _success: true,
          _error: null,
        } as never,
      );
      completed += 1;
    } catch (jobError) {
      await admin.rpc(
        "finish_evaluation_processing_job" as never,
        {
          _job_id: job.id,
          _success: false,
          _error: jobError instanceof Error ? jobError.message : "Unknown processing error",
        } as never,
      );
      failed += 1;
    }
  }
  const claimedJobs = (jobs as unknown as ProcessingJob[] | null) ?? [];
  return { claimed: claimedJobs.length, completed, failed };
}
