import {
  AuthSourceSchema,
  ModelProfileConfigSchema,
  ProviderConfigSchema
} from "@lingshu/shared";
import { z } from "zod";

export const AgentConfigSchema = z.object({
  profile: z.string().min(1)
});

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
  agents: z.record(z.string().min(1), AgentConfigSchema).default({})
});

export type LingshuConfig = z.infer<typeof LingshuConfigSchema>;

export const SecretFileSchema = z
  .object({
    secrets: z.record(z.string().min(1), z.string().min(1)).default({})
  })
  .default({ secrets: {} });

export type SecretFile = z.infer<typeof SecretFileSchema>;

export { AuthSourceSchema };
