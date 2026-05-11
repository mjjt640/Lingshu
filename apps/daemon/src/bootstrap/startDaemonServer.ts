import type { WebSocketServer } from "ws";
import { attachEventSocket } from "../control-api/eventSocket.js";
import {
  createDaemonApp,
  type CreateDaemonAppOptions,
  type DaemonApp
} from "./createDaemonApp.js";

export interface StartDaemonServerOptions extends CreateDaemonAppOptions {
  host: string;
  port: number;
}

export interface StartedDaemonServer {
  app: DaemonApp;
  socketServer: WebSocketServer;
  close: () => Promise<void>;
}

export async function startDaemonServer(options: StartDaemonServerOptions): Promise<StartedDaemonServer> {
  const app = await createDaemonApp(options);
  const socketServer = attachEventSocket(app.server, app.eventBus);
  socketServer.on("error", () => {
    // Fastify's listen promise reports the startup failure; this prevents ws from crashing first.
  });

  await app.listen({
    host: options.host,
    port: options.port
  });

  return {
    app,
    socketServer,
    close: async () => {
      terminateWebSocketClients(socketServer);
      await closeWebSocketServer(socketServer);
      await app.close();
    }
  };
}

function terminateWebSocketClients(socketServer: WebSocketServer): void {
  for (const socket of socketServer.clients) {
    socket.terminate();
  }
}

async function closeWebSocketServer(socketServer: WebSocketServer): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    socketServer.close((error) => {
      if (error) {
        reject(error);
        return;
      }

      resolve();
    });
  });
}
