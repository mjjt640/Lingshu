import type {
  HealthResponse,
  ModelCapabilities,
  ModelProfileSummary,
  ProviderSummary,
  ResolvedModelProfile,
  RuntimeEvent,
  TaskModelSnapshotResponse
} from "@lingshu/shared";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  createTaskModelSnapshot,
  fetchHealth,
  fetchModelProfiles,
  fetchModelSelection,
  fetchProviders,
  subscribeRuntimeEvents,
  switchModelProfile
} from "./api/runtimeClient";
import "./styles.css";

declare global {
  interface Window {
    lingshu?: {
      platform: string;
    };
  }
}

type RuntimeStatus = "checking" | "connected" | "disconnected";

const platformName = window.lingshu?.platform ?? "unknown";

const capabilityLabels: Array<[keyof ModelCapabilities, string]> = [
  ["supportsStreaming", "流式"],
  ["supportsTools", "工具"],
  ["supportsVision", "视觉"],
  ["supportsJson", "JSON"],
  ["supportsReasoning", "推理"],
  ["supportsSystemPrompt", "系统提示"],
  ["supportsLocalExecution", "本地执行"]
];

function formatStartedAt(health: HealthResponse | null): string {
  if (!health) {
    return "等待 Runtime 响应";
  }

  return formatDateTime(health.startedAt);
}

function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat("zh-CN", {
    dateStyle: "medium",
    timeStyle: "medium"
  }).format(new Date(value));
}

function getCapabilitySummary(capabilities: ModelCapabilities | undefined): string {
  if (!capabilities) {
    return "未声明";
  }

  const enabled = capabilityLabels
    .filter(([key]) => capabilities[key])
    .map(([, label]) => label);

  return enabled.length > 0 ? enabled.join(" / ") : "基础文本";
}

function describeEvent(event: RuntimeEvent): string {
  if (event.type === "runtime.ready") {
    return `Runtime 已就绪，启动时间 ${formatDateTime(event.startedAt)}`;
  }

  if (event.type === "model.profiles_loaded") {
    return `模型 profile 已加载：${event.count} 个`;
  }

  if (event.type === "model.switched") {
    return `模型已切换：${event.previousProfile ?? "未选择"} -> ${event.currentProfile} (${event.provider}/${event.model})`;
  }

  return event.message;
}

export function App() {
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [profiles, setProfiles] = useState<ModelProfileSummary[]>([]);
  const [providers, setProviders] = useState<ProviderSummary[]>([]);
  const [defaultProfile, setDefaultProfile] = useState<string | null>(null);
  const [selectedProfileId, setSelectedProfileId] = useState<string | null>(null);
  const [resolvedProfile, setResolvedProfile] = useState<ResolvedModelProfile | null>(null);
  const [snapshot, setSnapshot] = useState<TaskModelSnapshotResponse | null>(null);
  const [events, setEvents] = useState<RuntimeEvent[]>([]);
  const [status, setStatus] = useState<RuntimeStatus>("checking");
  const [error, setError] = useState<string | null>(null);
  const [switchError, setSwitchError] = useState<string | null>(null);
  const [snapshotError, setSnapshotError] = useState<string | null>(null);
  const [lastSwitchedAt, setLastSwitchedAt] = useState<string | null>(null);
  const [switching, setSwitching] = useState(false);
  const [snapshotLoading, setSnapshotLoading] = useState(false);
  const snapshotRequestIdRef = useRef(0);

  useEffect(() => {
    let active = true;

    async function loadRuntimeState(): Promise<void> {
      setStatus("checking");

      try {
        const [healthResponse, profileResponse, providerResponse, selectionResponse] =
          await Promise.all([
            fetchHealth(),
            fetchModelProfiles(),
            fetchProviders(),
            fetchModelSelection()
          ]);
        if (!active) {
          return;
        }

        setHealth(healthResponse);
        setProfiles(profileResponse.profiles);
        setProviders(providerResponse.providers);
        setDefaultProfile(profileResponse.defaultProfile);
        setSelectedProfileId(
          selectionResponse.selectedProfile ??
            profileResponse.selectedProfile ??
            profileResponse.defaultProfile
        );
        setResolvedProfile(selectionResponse.resolvedProfile);
        setStatus("connected");
        setError(null);
      } catch (loadError) {
        if (!active) {
          return;
        }

        setStatus("disconnected");
        setError(loadError instanceof Error ? loadError.message : "Runtime 连接失败");
      }
    }

    void loadRuntimeState();

    const unsubscribe = subscribeRuntimeEvents(
      (event) => {
        if (!active) {
          return;
        }

        setEvents((current) => [event, ...current].slice(0, 20));
        if (event.type === "runtime.ready") {
          setStatus("connected");
          setError(null);
        }

        if (event.type === "model.switched") {
          void fetchModelSelection()
            .then((selectionResponse) => {
              if (!active) {
                return;
              }

              setSelectedProfileId(selectionResponse.selectedProfile);
              setResolvedProfile(selectionResponse.resolvedProfile);
            })
            .catch((selectionError) => {
              if (!active) {
                return;
              }

              setError(
                selectionError instanceof Error
                  ? selectionError.message
                  : "模型选择状态刷新失败"
              );
            });
        }
      },
      (message) => {
        if (!active) {
          return;
        }

        setError(message);
      },
      (message) => {
        if (!active) {
          return;
        }

        setStatus("disconnected");
        setError(message);
      }
    );

    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  const providerById = useMemo(() => {
    return new Map(providers.map((provider) => [provider.id, provider]));
  }, [providers]);

  const selectedProfile = useMemo(() => {
    return profiles.find((profile) => profile.id === selectedProfileId) ?? null;
  }, [profiles, selectedProfileId]);

  const selectedProvider = useMemo(() => {
    if (resolvedProfile?.provider) {
      return resolvedProfile.provider;
    }

    if (!selectedProfile) {
      return null;
    }

    return providerById.get(selectedProfile.provider) ?? null;
  }, [providerById, resolvedProfile, selectedProfile]);

  const selectedCapabilities =
    resolvedProfile?.capabilities ?? selectedProfile?.capabilities;
  const selectedModel = resolvedProfile?.model ?? selectedProfile?.model ?? null;

  const statusText = useMemo(() => {
    if (status === "connected") {
      return "已连接";
    }

    if (status === "checking") {
      return "检查中";
    }

    return "未连接";
  }, [status]);

  async function handleProfileChange(profileId: string): Promise<void> {
    if (!profileId || profileId === selectedProfileId) {
      return;
    }

    const previousProfileId = selectedProfileId;
    snapshotRequestIdRef.current += 1;
    setSelectedProfileId(profileId);
    setSwitching(true);
    setSnapshotLoading(false);
    setSwitchError(null);
    setSnapshotError(null);

    try {
      const switchResponse = await switchModelProfile(profileId);
      setSelectedProfileId(switchResponse.selectedProfile);
      setResolvedProfile(switchResponse.resolvedProfile);
      setLastSwitchedAt(switchResponse.switchedAt ?? new Date().toISOString());

      const requestId = snapshotRequestIdRef.current + 1;
      snapshotRequestIdRef.current = requestId;

      try {
        const snapshotResponse = await createTaskModelSnapshot(
          switchResponse.selectedProfile
        );

        if (snapshotRequestIdRef.current === requestId) {
          setSnapshot(snapshotResponse);
        }
      } catch (snapshotLoadError) {
        if (snapshotRequestIdRef.current === requestId) {
          setSnapshotError(
            snapshotLoadError instanceof Error
              ? snapshotLoadError.message
              : "模型快照生成失败"
          );
        }
      }
    } catch (profileSwitchError) {
      setSelectedProfileId(previousProfileId);
      setSwitchError(
        profileSwitchError instanceof Error
          ? profileSwitchError.message
          : "模型 profile 切换失败"
      );
    } finally {
      setSwitching(false);
    }
  }

  async function handleCreateSnapshot(): Promise<void> {
    const profileId = selectedProfileId;

    if (!profileId) {
      return;
    }

    const requestId = snapshotRequestIdRef.current + 1;
    snapshotRequestIdRef.current = requestId;
    setSnapshotLoading(true);
    setSnapshotError(null);

    try {
      const snapshotResponse = await createTaskModelSnapshot(profileId);

      if (snapshotRequestIdRef.current === requestId) {
        setSnapshot(snapshotResponse);
      }
    } catch (snapshotLoadError) {
      if (snapshotRequestIdRef.current === requestId) {
        setSnapshotError(
          snapshotLoadError instanceof Error
            ? snapshotLoadError.message
            : "模型快照生成失败"
        );
      }
    } finally {
      if (snapshotRequestIdRef.current === requestId) {
        setSnapshotLoading(false);
      }
    }
  }

  return (
    <main className="appShell">
      <aside className="sidebar">
        <div className="brandBlock">
          <span className="brandMark">灵</span>
          <div>
            <h1>灵枢</h1>
            <p>本地 Runtime 控制台</p>
          </div>
        </div>

        <section className="runtimePanel" aria-label="Runtime 连接状态">
          <div className="sectionTitle">
            <h2>Runtime</h2>
            <span className={`statusBadge ${status}`}>{statusText}</span>
          </div>
          <dl className="runtimeFacts">
            <div>
              <dt>服务</dt>
              <dd>{health?.service ?? "lingshu-runtime"}</dd>
            </div>
            <div>
              <dt>版本</dt>
              <dd>{health?.version ?? "未知"}</dd>
            </div>
            <div>
              <dt>启动时间</dt>
              <dd>{formatStartedAt(health)}</dd>
            </div>
            <div>
              <dt>平台</dt>
              <dd>{platformName}</dd>
            </div>
          </dl>
          {error ? <p className="errorText">{error}</p> : null}
        </section>
      </aside>

      <section className="workspace">
        <header className="workspaceHeader">
          <div>
            <p className="eyebrow">第二阶段</p>
            <h2>模型 Profile</h2>
          </div>
          <div className="summaryStrip">
            <span>{profiles.length} 个 profile</span>
            <span>{providers.length} 个 provider</span>
            <span>默认：{defaultProfile ?? "未设置"}</span>
            <span>当前：{selectedProfileId ?? "未选择"}</span>
          </div>
        </header>

        <section className="profileSwitcher" aria-label="模型 profile 切换">
          <div className="sectionTitle">
            <h2>当前选择</h2>
            <span
              className={`statusBadge ${
                switching ? "checking" : selectedProfileId ? "connected" : "disconnected"
              }`}
            >
              {switching ? "切换中" : selectedProfileId ? "已选择" : "未选择"}
            </span>
          </div>

          <div className="switcherBody">
            <label className="selectField" htmlFor="profileSelect">
              <span>Profile</span>
              <select
                id="profileSelect"
                value={selectedProfileId ?? ""}
                disabled={status !== "connected" || switching || profiles.length === 0}
                onChange={(event) => void handleProfileChange(event.target.value)}
              >
                <option value="" disabled>
                  未选择
                </option>
                {profiles.map((profile) => (
                  <option key={profile.id} value={profile.id}>
                    {profile.label} ({profile.id})
                  </option>
                ))}
              </select>
            </label>

            <dl className="selectionFacts">
              <div>
                <dt>Profile ID</dt>
                <dd>
                  <code>{selectedProfileId ?? "未选择"}</code>
                </dd>
              </div>
              <div>
                <dt>Provider Type</dt>
                <dd>{selectedProvider?.type ?? selectedProfile?.providerType ?? "未解析"}</dd>
              </div>
              <div>
                <dt>Provider ID</dt>
                <dd>
                  <code>{selectedProvider?.id ?? selectedProfile?.provider ?? "未解析"}</code>
                </dd>
              </div>
              <div>
                <dt>Model ID</dt>
                <dd>
                  <code>{selectedModel ?? "未解析"}</code>
                </dd>
              </div>
              <div className="wideFact">
                <dt>能力</dt>
                <dd>{getCapabilitySummary(selectedCapabilities)}</dd>
              </div>
            </dl>
          </div>

          {lastSwitchedAt ? (
            <p className="muted">最近切换：{formatDateTime(lastSwitchedAt)}</p>
          ) : null}
          {switchError ? <p className="errorText">{switchError}</p> : null}
        </section>

        <section className="snapshotPanel" aria-label="任务模型快照">
          <div className="sectionTitle">
            <h2>任务模型快照</h2>
            <button
              type="button"
              disabled={
                status !== "connected" ||
                !selectedProfileId ||
                switching ||
                snapshotLoading
              }
              onClick={() => void handleCreateSnapshot()}
            >
              {snapshotLoading ? "生成中" : "生成下一任务模型快照"}
            </button>
          </div>

          {snapshot ? (
            <dl className="snapshotFacts">
              <div>
                <dt>Profile ID</dt>
                <dd>
                  <code>{snapshot.profileId}</code>
                </dd>
              </div>
              <div>
                <dt>Provider</dt>
                <dd>
                  <code>{snapshot.resolvedProfile.provider.id}</code>
                </dd>
              </div>
              <div>
                <dt>Provider Type</dt>
                <dd>{snapshot.resolvedProfile.provider.type}</dd>
              </div>
              <div>
                <dt>Model ID</dt>
                <dd>
                  <code>{snapshot.resolvedProfile.model}</code>
                </dd>
              </div>
              <div className="wideFact">
                <dt>快照时间</dt>
                <dd>{formatDateTime(snapshot.snapshottedAt)}</dd>
              </div>
            </dl>
          ) : (
            <p className="muted">暂无快照</p>
          )}

          {snapshotError ? <p className="errorText">{snapshotError}</p> : null}
        </section>

        <section className="profileGrid" aria-label="模型 profile 列表">
          {profiles.length === 0 ? (
            <div className="emptyState">
              <strong>还没有读取到模型 profile</strong>
              <p>
                {status === "connected"
                  ? "Runtime 已连接，但当前没有配置任何模型 profile。"
                  : "Runtime daemon 未连接，暂时无法读取模型 profile。"}
              </p>
            </div>
          ) : null}

          {profiles.map((profile) => (
            <article className="profileCard" key={profile.id}>
              <div>
                <strong>{profile.label}</strong>
                <div className="tagGroup">
                  {selectedProfileId === profile.id ? (
                    <span className="selectedTag">当前</span>
                  ) : null}
                  {defaultProfile === profile.id ? (
                    <span className="defaultTag">默认</span>
                  ) : null}
                </div>
              </div>
              <dl>
                <div>
                  <dt>Profile ID</dt>
                  <dd>
                    <code>{profile.id}</code>
                  </dd>
                </div>
                <div>
                  <dt>提供方</dt>
                  <dd>
                    <code>{profile.provider}</code>
                  </dd>
                </div>
                {profile.providerType ? (
                  <div>
                    <dt>类型</dt>
                    <dd>{profile.providerType}</dd>
                  </div>
                ) : null}
                <div>
                  <dt>模型</dt>
                  <dd>
                    <code>{profile.model}</code>
                  </dd>
                </div>
                <div>
                  <dt>来源</dt>
                  <dd>{profile.source}</dd>
                </div>
                <div>
                  <dt>能力</dt>
                  <dd>{getCapabilitySummary(profile.capabilities)}</dd>
                </div>
              </dl>
            </article>
          ))}
        </section>

        <section className="eventPanel" aria-label="Runtime 事件列表">
          <div className="sectionTitle">
            <h2>Runtime 事件</h2>
            <span>{events.length}/20</span>
          </div>
          <div className="eventList">
            {events.length === 0 ? <p className="muted">暂无事件</p> : null}
            {events.map((event, index) => (
              <article className="eventItem" key={`${event.type}-${index}`}>
                <span>{event.type}</span>
                <p>{describeEvent(event)}</p>
              </article>
            ))}
          </div>
        </section>
      </section>
    </main>
  );
}
