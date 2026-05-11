import type { Server } from "node:http";
import { WebSocketServer } from "ws";
import type { RuntimeEventBus } from "../modules/events/eventBus.js";

export function attachEventSocket(server: Server, eventBus: RuntimeEventBus): WebSocketServer {
  const socketServer = new WebSocketServer({
    server,
    path: "/v1/ws"
  });

  socketServer.on("connection", (socket) => {
    const unsubscribe = eventBus.subscribe((event) => {
      socket.send(JSON.stringify(event));
    });

    socket.on("close", unsubscribe);
  });

  return socketServer;
}
