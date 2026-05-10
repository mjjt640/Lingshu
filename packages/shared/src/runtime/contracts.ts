import { z } from "zod";

export const HealthResponseSchema = z.object({
  service: z.literal("lingshu-runtime"),
  status: z.literal("ok"),
  version: z.string(),
  startedAt: z.string().datetime()
});

export type HealthResponse = z.infer<typeof HealthResponseSchema>;

export const ModelProfileSummarySchema = z.object({
  id: z.string().min(1),
  provider: z.string().min(1),
  model: z.string().min(1),
  label: z.string().min(1),
  source: z.string().min(1)
});

export type ModelProfileSummary = z.infer<typeof ModelProfileSummarySchema>;

export const ModelProfilesResponseSchema = z.object({
  defaultProfile: z.string().min(1).nullable(),
  profiles: z.array(ModelProfileSummarySchema)
});

export type ModelProfilesResponse = z.infer<typeof ModelProfilesResponseSchema>;
