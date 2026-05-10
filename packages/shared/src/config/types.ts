import { z } from "zod";

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

export const ProviderConfigSchema = z.object({
  type: ProviderKindSchema,
  base_url: z.string().url(),
  auth: AuthSourceSchema,
  catalog: z
    .object({
      source: z.enum(["static", "remote", "hybrid"])
    })
    .default({ source: "hybrid" })
});

export type ProviderConfig = z.infer<typeof ProviderConfigSchema>;

export const ModelProfileConfigSchema = z.object({
  provider: z.string().min(1),
  model: z.string().min(1),
  label: z.string().min(1).optional(),
  temperature: z.number().min(0).max(2).optional(),
  max_output_tokens: z.number().int().positive().optional()
});

export type ModelProfileConfig = z.infer<typeof ModelProfileConfigSchema>;
