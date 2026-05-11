import {
  HealthResponseSchema,
  ModelProfilesResponseSchema,
  ModelSelectionResponseSchema,
  ProvidersResponseSchema,
  RuntimeEventSchema,
  SwitchModelProfileResponseSchema,
  TaskModelSnapshotResponseSchema,
  type HealthResponse,
  type ModelProfilesResponse,
  type ModelSelectionResponse,
  type ProvidersResponse,
  type RuntimeEvent,
  type SwitchModelProfileResponse,
  type TaskModelSnapshotResponse
} from "@lingshu/shared";

const runtimeBaseUrl = "http://127.0.0.1:4317";
const runtimeSocketUrl = "ws://127.0.0.1:4317/v1/ws";

async function readJson(response: Response): Promise<unknown> {
  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    const message =
      payload &&
      typeof payload === "object" &&
      "error" in payload &&
      typeof payload.error === "string"
        ? payload.error
        : `Runtime 请求失败：HTTP ${response.status}`;

    throw new Error(message);
  }

  return payload;
}

export async function fetchHealth(): Promise<HealthResponse> {
  const payload = await readJson(await fetch(`${runtimeBaseUrl}/v1/health`));
  return HealthResponseSchema.parse(payload);
}

export async function fetchModelProfiles(): Promise<ModelProfilesResponse> {
  const payload = await readJson(await fetch(`${runtimeBaseUrl}/v1/models/profiles`));
  return ModelProfilesResponseSchema.parse(payload);
}

export async function fetchProviders(): Promise<ProvidersResponse> {
  const payload = await readJson(await fetch(`${runtimeBaseUrl}/v1/providers`));
  return ProvidersResponseSchema.parse(payload);
}

export async function fetchModelSelection(): Promise<ModelSelectionResponse> {
  const payload = await readJson(await fetch(`${runtimeBaseUrl}/v1/models/selection`));
  return ModelSelectionResponseSchema.parse(payload);
}

export async function switchModelProfile(
  profileId: string
): Promise<SwitchModelProfileResponse> {
  const payload = await readJson(
    await fetch(`${runtimeBaseUrl}/v1/models/selection`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ profileId })
    })
  );

  return SwitchModelProfileResponseSchema.parse(payload);
}

export async function createTaskModelSnapshot(
  profileId?: string
): Promise<TaskModelSnapshotResponse> {
  const payload = await readJson(
    await fetch(`${runtimeBaseUrl}/v1/tasks/model-snapshot`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(profileId ? { profileId } : {})
    })
  );

  return TaskModelSnapshotResponseSchema.parse(payload);
}

export function subscribeRuntimeEvents(
  onEvent: (event: RuntimeEvent) => void,
  onError: (message: string) => void,
  onClose: (message: string) => void
): () => void {
  const socket = new WebSocket(runtimeSocketUrl);
  let cleanupClosing = false;

  socket.addEventListener("message", (message) => {
    try {
      onEvent(RuntimeEventSchema.parse(JSON.parse(String(message.data))));
    } catch (error) {
      onError(error instanceof Error ? error.message : "Runtime 事件解析失败");
    }
  });

  socket.addEventListener("error", () => {
    onError("Runtime 事件连接失败");
  });

  socket.addEventListener("close", () => {
    if (!cleanupClosing) {
      onClose("Runtime 事件连接已断开");
    }
  });

  return () => {
    cleanupClosing = true;
    socket.close();
  };
}
