import { z } from "zod";

import {
  AuthSourceKindSchema,
  ProviderCatalogSourceSchema,
  ProviderKindSchema
} from "../config/types.js";

export const HealthResponseSchema = z.object({
  service: z.literal("lingshu-runtime"),
  status: z.literal("ok"),
  version: z.string(),
  startedAt: z.string().datetime()
});

export type HealthResponse = z.infer<typeof HealthResponseSchema>;

export const ProviderAuthStatusSchema = z
  .object({
    source: AuthSourceKindSchema,
    status: z.enum(["configured", "missing", "not_required"])
  })
  .strict();

export type ProviderAuthStatus = z.infer<typeof ProviderAuthStatusSchema>;

export const ProviderSummarySchema = z
  .object({
    id: z.string().min(1),
    type: ProviderKindSchema,
    baseUrl: z.string().url(),
    auth: ProviderAuthStatusSchema,
    catalog: z
      .object({
        source: ProviderCatalogSourceSchema
      })
      .strict()
      .optional()
  })
  .strict();

export type ProviderSummary = z.infer<typeof ProviderSummarySchema>;

export const ModelCapabilitiesSchema = z
  .object({
    supportsStreaming: z.boolean(),
    supportsTools: z.boolean(),
    supportsVision: z.boolean(),
    supportsJson: z.boolean(),
    supportsReasoning: z.boolean(),
    supportsSystemPrompt: z.boolean(),
    supportsLocalExecution: z.boolean()
  })
  .strict();

export type ModelCapabilities = z.infer<typeof ModelCapabilitiesSchema>;

export const ModelProfileSummarySchema = z.object({
  id: z.string().min(1),
  provider: z.string().min(1),
  model: z.string().min(1),
  label: z.string().min(1),
  source: z.string().min(1),
  providerType: ProviderKindSchema.optional(),
  capabilities: ModelCapabilitiesSchema.optional()
});

export type ModelProfileSummary = z.infer<typeof ModelProfileSummarySchema>;

export const ModelProfilesResponseSchema = z.object({
  defaultProfile: z.string().min(1).nullable(),
  selectedProfile: z.string().min(1).nullable().optional(),
  profiles: z.array(ModelProfileSummarySchema)
});

export type ModelProfilesResponse = z.infer<typeof ModelProfilesResponseSchema>;

const ModelParametersSchema = z
  .object({
    temperature: z.number().min(0).max(2).optional(),
    maxOutputTokens: z.number().int().positive().optional()
  })
  .strict();

export const ResolvedModelProfileSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  provider: ProviderSummarySchema,
  model: z.string().min(1),
  parameters: ModelParametersSchema,
  capabilities: ModelCapabilitiesSchema,
  source: z.string().min(1)
});

export type ResolvedModelProfile = z.infer<typeof ResolvedModelProfileSchema>;

export const ModelSelectionResponseSchema = z.object({
  selectedProfile: z.string().min(1).nullable(),
  resolvedProfile: ResolvedModelProfileSchema.nullable()
});

export type ModelSelectionResponse = z.infer<typeof ModelSelectionResponseSchema>;

export const SwitchModelProfileRequestSchema = z.object({
  profileId: z.string().min(1)
});

export type SwitchModelProfileRequest = z.infer<typeof SwitchModelProfileRequestSchema>;

export const SwitchModelProfileResponseSchema = z.object({
  previousProfile: z.string().min(1).nullable(),
  selectedProfile: z.string().min(1),
  resolvedProfile: ResolvedModelProfileSchema,
  switchedAt: z.string().datetime().optional()
});

export type SwitchModelProfileResponse = z.infer<
  typeof SwitchModelProfileResponseSchema
>;

export const TaskModelSnapshotRequestSchema = z.object({
  profileId: z.string().min(1).optional()
});

export type TaskModelSnapshotRequest = z.infer<
  typeof TaskModelSnapshotRequestSchema
>;

export const TaskModelSnapshotResponseSchema = z.object({
  profileId: z.string().min(1),
  resolvedProfile: ResolvedModelProfileSchema,
  snapshottedAt: z.string().datetime()
});

export type TaskModelSnapshotResponse = z.infer<
  typeof TaskModelSnapshotResponseSchema
>;

export const ProvidersResponseSchema = z.object({
  providers: z.array(ProviderSummarySchema)
});

export type ProvidersResponse = z.infer<typeof ProvidersResponseSchema>;
