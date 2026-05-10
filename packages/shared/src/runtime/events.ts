import { z } from "zod";

export const RuntimeEventSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("runtime.ready"),
    service: z.literal("lingshu-runtime"),
    startedAt: z.string().datetime()
  }),
  z.object({
    type: z.literal("model.profiles_loaded"),
    count: z.number().int().nonnegative()
  }),
  z.object({
    type: z.literal("runtime.error"),
    message: z.string().min(1)
  })
]);

export type RuntimeEvent = z.infer<typeof RuntimeEventSchema>;
