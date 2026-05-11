import { startDaemonServer } from "./bootstrap/startDaemonServer.js";

const port = Number(process.env.LINGSHU_RUNTIME_PORT ?? 4317);
const host = "127.0.0.1";
const workspaceDir = process.env.LINGSHU_WORKSPACE_DIR ?? process.cwd();
const homeDir = process.env.LINGSHU_HOME_DIR;

const server = await startDaemonServer({
  host,
  port,
  workspaceDir,
  homeDir
}).catch((error: unknown) => {
  console.error(`lingshu-runtime failed to listen on ${host}:${port}`);
  console.error(error);
  process.exit(1);
});

console.log(`lingshu-runtime listening on http://${host}:${port}`);

async function shutdown(): Promise<void> {
  await server.close();
  process.exit(0);
}

process.on("SIGTERM", () => {
  void shutdown();
});
