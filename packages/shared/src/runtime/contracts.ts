import { z } from "zod";

import {
  AuthSourceKindSchema,
  ProviderCatalogSourceSchema,
  ProviderKindSchema,
  ReasoningEffortSchema,
  WireApiSchema
} from "../config/types.js";

export const HealthResponseSchema = z.object({
  service: z.literal("lingshu-runtime"),
  status: z.literal("ok"),
  version: z.string(),
  startedAt: z.string().datetime()
});

export type HealthResponse = z.infer<typeof HealthResponseSchema>;

function isSafeProviderBaseUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return (
      (url.protocol === "http:" || url.protocol === "https:") &&
      url.username === "" &&
      url.password === "" &&
      url.search === "" &&
      url.hash === ""
    );
  } catch {
    return false;
  }
}

export const ProviderBaseUrlSchema = z
  .string()
  .url()
  .refine(isSafeProviderBaseUrl, {
    message: "Provider baseUrl must not include credentials, query, or hash"
  });

export type ProviderBaseUrl = z.infer<typeof ProviderBaseUrlSchema>;

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
    baseUrl: ProviderBaseUrlSchema,
    auth: ProviderAuthStatusSchema,
    wireApi: WireApiSchema.optional(),
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
    maxOutputTokens: z.number().int().positive().optional(),
    reasoningEffort: ReasoningEffortSchema.optional()
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
}).strict();

export type ResolvedModelProfile = z.infer<typeof ResolvedModelProfileSchema>;

export const ModelSelectionResponseSchema = z.object({
  selectedProfile: z.string().min(1).nullable(),
  resolvedProfile: ResolvedModelProfileSchema.nullable()
}).strict();

export type ModelSelectionResponse = z.infer<typeof ModelSelectionResponseSchema>;

export const SwitchModelProfileRequestSchema = z.object({
  profileId: z.string().min(1)
}).strict();

export type SwitchModelProfileRequest = z.infer<typeof SwitchModelProfileRequestSchema>;

export const SwitchModelProfileResponseSchema = z.object({
  previousProfile: z.string().min(1).nullable(),
  selectedProfile: z.string().min(1),
  resolvedProfile: ResolvedModelProfileSchema,
  switchedAt: z.string().datetime().optional()
}).strict();

export type SwitchModelProfileResponse = z.infer<
  typeof SwitchModelProfileResponseSchema
>;

export const TaskModelSnapshotRequestSchema = z.object({
  profileId: z.string().min(1).optional()
}).strict();

export type TaskModelSnapshotRequest = z.infer<
  typeof TaskModelSnapshotRequestSchema
>;

export const TaskModelSnapshotResponseSchema = z.object({
  profileId: z.string().min(1),
  resolvedProfile: ResolvedModelProfileSchema,
  snapshottedAt: z.string().datetime()
}).strict();

export type TaskModelSnapshotResponse = z.infer<
  typeof TaskModelSnapshotResponseSchema
>;

export const ProvidersResponseSchema = z.object({
  providers: z.array(ProviderSummarySchema)
}).strict();

export type ProvidersResponse = z.infer<typeof ProvidersResponseSchema>;
