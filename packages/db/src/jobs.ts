import type { SupabaseClient } from "@supabase/supabase-js";
import {
  instantiate,
  templateFor,
  deriveJobStatus,
  type ServiceType,
  type JobStep,
} from "@tallocpa/routes";

export interface CreateJobResult {
  jobId: string;
  status: string;
  steps: JobStep[];
}

/**
 * Create a live job by instantiating a service route template and persisting
 * the job + its materialized steps. Throws loudly on any DB error so a partial
 * write never passes silently.
 */
export async function createJob(
  supabase: SupabaseClient,
  params: { clientId: string; serviceType: ServiceType; period?: string | null },
): Promise<CreateJobResult> {
  const template = templateFor(params.serviceType);
  const { job, steps } = instantiate(template, {
    clientId: params.clientId,
    period: params.period ?? null,
  });
  const status = deriveJobStatus(steps);

  const { data: jobRow, error: jobError } = await supabase
    .from("jobs")
    .insert({
      client_id: job.clientId,
      service_type: job.serviceType,
      archetype: job.archetype,
      template_version: job.templateVersion,
      period: job.period,
      status,
    })
    .select("id")
    .single();
  if (jobError) throw jobError;
  const jobId = (jobRow as { id: string }).id;

  const stepRows = steps.map((s) => ({
    job_id: jobId,
    step_key: s.key,
    name: s.name,
    step_order: s.order,
    owner_role: s.ownerRole,
    is_review_gate: s.isReviewGate,
    status: s.status,
  }));
  const { error: stepsError } = await supabase.from("job_steps").insert(stepRows);
  if (stepsError) throw stepsError;

  return { jobId, status, steps };
}
