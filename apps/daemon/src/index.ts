import { startDaemonServer } from "./bootstrap/startDaemonServer.js";

const port = Number(process.env.LINGSHU_RUNTIME_PORT ?? 4317);
const host = "127.0.0.1";
const workspaceDir = process.env.LINGSHU_WORKSPACE_DIR ?? process.cwd();

const server = await startDaemonServer({
  host,
  port,
  workspaceDir
});

console.log(`lingshu-runtime listening on http://${host}:${port}`);

async function shutdown(): Promise<void> {
  await server.close();
  process.exit(0);
}

process.on("SIGTERM", () => {
  void shutdown();
});
