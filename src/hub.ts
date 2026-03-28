import WebSocket from "ws";
import { RunnerConfig, HubEvent } from "./types";

export type EventHandler = (event: HubEvent, sendReply: (content: string, to?: string) => void) => void;

export class HubConnection {
  private ws: WebSocket | null = null;
  private config: RunnerConfig;
  private onEvent: EventHandler;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private pingTimer: ReturnType<typeof setInterval> | null = null;
  private stopped = false;

  constructor(config: RunnerConfig, onEvent: EventHandler) {
    this.config = config;
    this.onEvent = onEvent;
  }

  connect(): void {
    if (this.stopped) return;

    const wsUrl = `${this.config.hub_url.replace(/^http/, "ws")}/bot/v1/ws?token=${this.config.app_token}`;
    this.ws = new WebSocket(wsUrl);

    this.ws.on("open", () => {
      console.log("✓ 已连接到 Hub");
      // Start ping interval
      this.pingTimer = setInterval(() => {
        if (this.ws?.readyState === WebSocket.OPEN) {
          this.ws.send(JSON.stringify({ type: "ping" }));
        }
      }, 30000);
    });

    this.ws.on("message", (data: WebSocket.Data) => {
      try {
        const msg = JSON.parse(data.toString());
        if (msg.type === "init") {
          console.log(`  Bot: ${msg.data.bot_id}`);
          console.log(`  App: ${msg.data.app_slug}`);
          return;
        }
        if (msg.type === "event") {
          const ev = msg as HubEvent;
          const sender = ev.event.data?.sender?.id as string || "";
          const traceId = ev.trace_id || "";
          this.onEvent(ev, (content, to) => this.sendReply(content, to || sender, traceId));
          return;
        }
        if (msg.type === "pong" || msg.type === "ack") return;
        if (msg.type === "error") {
          console.error(`Hub 错误: ${msg.error}`);
          return;
        }
      } catch (err) {
        console.error("消息解析失败:", err);
      }
    });

    this.ws.on("close", () => {
      console.log("与 Hub 断开连接");
      this.cleanup();
      if (!this.stopped) {
        console.log("5 秒后重连...");
        this.reconnectTimer = setTimeout(() => this.connect(), 5000);
      }
    });

    this.ws.on("error", (err) => {
      console.error("连接错误:", err.message);
    });
  }

  sendReply(content: string, to: string, traceId?: string): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      const msg: Record<string, string> = { type: "send", content, to };
      if (traceId) msg.trace_id = traceId;
      this.ws.send(JSON.stringify(msg));
    }
  }

  stop(): void {
    this.stopped = true;
    this.cleanup();
    this.ws?.close();
  }

  private cleanup(): void {
    if (this.pingTimer) { clearInterval(this.pingTimer); this.pingTimer = null; }
    if (this.reconnectTimer) { clearTimeout(this.reconnectTimer); this.reconnectTimer = null; }
  }
}
