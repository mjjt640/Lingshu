import { EventEmitter } from "node:events";
import type { RuntimeEvent } from "@lingshu/shared";

export class RuntimeEventBus {
  private readonly emitter = new EventEmitter();

  publish(event: RuntimeEvent): void {
    this.emitter.emit("event", event);
  }

  subscribe(listener: (event: RuntimeEvent) => void): () => void {
    this.emitter.on("event", listener);
    return () => this.emitter.off("event", listener);
  }
}
