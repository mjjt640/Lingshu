export type Brand<TValue, TBrand extends string> = TValue & { readonly __brand: TBrand };

export type SessionId = Brand<string, "SessionId">;
export type TaskId = Brand<string, "TaskId">;
export type AgentId = Brand<string, "AgentId">;
export type ModelProfileId = Brand<string, "ModelProfileId">;

export function createId<TBrand extends string>(prefix: string): Brand<string, TBrand> {
  const random = crypto.randomUUID();
  return `${prefix}_${random}` as Brand<string, TBrand>;
}
