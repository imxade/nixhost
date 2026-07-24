import { EventEmitter } from "node:events";

export interface PlatformEvent {
  id: number;
  type: string;
  scope: string;
  timestamp: string;
  data: unknown;
}

class EventBus {
  private readonly emitter = new EventEmitter();
  private readonly history: PlatformEvent[] = [];
  private sequence = 0;

  constructor(private readonly historyLimit = 2000) {
    this.emitter.setMaxListeners(500);
  }

  publish(type: string, scope: string, data: unknown): PlatformEvent {
    const event: PlatformEvent = {
      id: ++this.sequence,
      type,
      scope,
      timestamp: new Date().toISOString(),
      data,
    };
    this.history.push(event);
    if (this.history.length > this.historyLimit) this.history.splice(0, this.history.length - this.historyLimit);
    this.emitter.emit("event", event);
    return event;
  }

  subscribe(listener: (event: PlatformEvent) => void): () => void {
    this.emitter.on("event", listener);
    return () => this.emitter.off("event", listener);
  }

  since(id: number, scope?: string): PlatformEvent[] {
    return this.history.filter((event) => event.id > id && (!scope || event.scope === scope || event.scope === "system"));
  }
}

export const events = new EventBus();
