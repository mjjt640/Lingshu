import { z } from "zod";

export const AuthSourceKindSchema = z.enum([
  "none",
  "env",
  "secret_ref",
  "runtime_secret",
  "inline"
]);

export type AuthSourceKind = z.infer<typeof AuthSourceKindSchema>;

export const AuthSourceSchema = z.discriminatedUnion("source", [
  z.object({ source: z.literal("none") }),
  z.object({ source: z.literal("env"), env: z.string().min(1) }),
  z.object({ source: z.literal("secret_ref"), ref: z.string().min(1) }),
  z.object({ source: z.literal("runtime_secret"), id: z.string().min(1) }),
  z.object({ source: z.literal("inline"), value: z.string().min(1) })
]);

export type AuthSource = z.infer<typeof AuthSourceSchema>;

export const ProviderKindSchema = z.enum([
  "openai",
  "anthropic",
  "openrouter",
  "ollama",
  "openai-compatible"
]);

export type ProviderKind = z.infer<typeof ProviderKindSchema>;

export const ProviderCatalogSourceSchema = z.enum(["static", "remote", "hybrid"]);

export type ProviderCatalogSource = z.infer<typeof ProviderCatalogSourceSchema>;

export const WireApiSchema = z.enum(["responses", "chat_completions"]);

export type WireApi = z.infer<typeof WireApiSchema>;

export const ReasoningEffortSchema = z.enum([
  "none",
  "minimal",
  "low",
  "medium",
  "high",
  "xhigh"
]);

export type ReasoningEffort = z.infer<typeof ReasoningEffortSchema>;

export const ProviderConfigSchema = z.object({
  type: ProviderKindSchema,
  base_url: z.string().url(),
  wire_api: WireApiSchema.optional(),
  auth: AuthSourceSchema,
  catalog: z
    .object({
      source: ProviderCatalogSourceSchema
    })
    .default({ source: "hybrid" })
});

export type ProviderConfig = z.infer<typeof ProviderConfigSchema>;

export const ModelProfileConfigSchema = z.object({
  provider: z.string().min(1),
  model: z.string().min(1),
  label: z.string().min(1).optional(),
  temperature: z.number().min(0).max(2).optional(),
  max_output_tokens: z.number().int().positive().optional(),
  reasoning_effort: ReasoningEffortSchema.optional()
});

export type ModelProfileConfig = z.infer<typeof ModelProfileConfigSchema>;
