import { app, BrowserWindow } from "electron";
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
let daemonProcess: ChildProcessWithoutNullStreams | null = null;

function startDaemon(): void {
  if (daemonProcess) {
    return;
  }

  const daemonEntry = path.resolve(__dirname, "../../../daemon/dist/index.js");
  daemonProcess = spawn(process.execPath, [daemonEntry], {
    env: {
      ...process.env,
      ELECTRON_RUN_AS_NODE: "1",
      LINGSHU_WORKSPACE_DIR: process.cwd(),
      LINGSHU_RUNTIME_PORT: process.env.LINGSHU_RUNTIME_PORT ?? "4317"
    },
    stdio: "pipe"
  });

  daemonProcess.stdout.on("data", (chunk) => {
    console.log(`[lingshu-runtime] ${String(chunk).trim()}`);
  });

  daemonProcess.stderr.on("data", (chunk) => {
    console.error(`[lingshu-runtime] ${String(chunk).trim()}`);
  });

  daemonProcess.on("exit", () => {
    daemonProcess = null;
  });
}

function stopDaemon(): void {
  if (!daemonProcess) {
    return;
  }

  daemonProcess.kill("SIGTERM");
  daemonProcess = null;
}

async function createWindow(): Promise<void> {
  const window = new BrowserWindow({
    width: 1200,
    height: 780,
    minWidth: 900,
    minHeight: 620,
    title: "灵枢 / Lingshu",
    backgroundColor: "#f7f6f2",
    webPreferences: {
      preload: path.join(__dirname, "../preload/preload.js"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  const devServerUrl = process.env.LINGSHU_RENDERER_URL;
  if (devServerUrl) {
    await window.loadURL(devServerUrl);
    return;
  }

  await window.loadFile(path.join(__dirname, "../renderer/index.html"));
}

app.whenReady().then(() => {
  startDaemon();
  void createWindow();
});

app.on("before-quit", stopDaemon);

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    void createWindow();
  }
});
