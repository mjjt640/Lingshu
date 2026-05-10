import {
  AuthSourceSchema,
  ModelProfileConfigSchema,
  ProviderConfigSchema,
  ReasoningEffortSchema
} from "@lingshu/shared";
import { z } from "zod";

export const AgentConfigSchema = z.object({
  profile: z.string().min(1)
});

export const CodexModelProviderConfigSchema = z.object({
  name: z.string().min(1).optional(),
  base_url: z.string().url(),
  wire_api: ProviderConfigSchema.shape.wire_api,
  requires_openai_auth: z.boolean().optional(),
  auth: AuthSourceSchema.optional()
}).passthrough();

export const LingshuConfigSchema = z.object({
  version: z.literal(1).default(1),
  app: z
    .object({
      default_profile: z.string().min(1).nullable().default(null)
    })
    .default({ default_profile: null }),
  trust: z
    .object({
      allow_workspace_providers: z.boolean().default(false),
      allow_insecure_http_hosts: z.array(z.string().min(1)).default(["127.0.0.1:11434", "localhost:11434"])
    })
    .default({
      allow_workspace_providers: false,
      allow_insecure_http_hosts: ["127.0.0.1:11434", "localhost:11434"]
    }),
  providers: z.record(z.string().min(1), ProviderConfigSchema).default({}),
  profiles: z.record(z.string().min(1), ModelProfileConfigSchema).default({}),
  agents: z.record(z.string().min(1), AgentConfigSchema).default({}),
  model_provider: z.string().min(1).optional(),
  model: z.string().min(1).optional(),
  review_model: z.string().min(1).optional(),
  model_reasoning_effort: ReasoningEffortSchema.optional(),
  disable_response_storage: z.boolean().optional(),
  network_access: z.enum(["enabled", "disabled", "restricted"]).optional(),
  model_context_window: z.number().int().positive().optional(),
  model_auto_compact_token_limit: z.number().int().positive().optional(),
  model_providers: z
    .record(z.string().min(1), CodexModelProviderConfigSchema)
    .optional()
});

export type LingshuConfig = z.infer<typeof LingshuConfigSchema>;

export const SecretFileSchema = z
  .object({
    secrets: z.record(z.string().min(1), z.string().min(1)).default({})
  })
  .default({ secrets: {} });

export type SecretFile = z.infer<typeof SecretFileSchema>;

export { AuthSourceSchema };
