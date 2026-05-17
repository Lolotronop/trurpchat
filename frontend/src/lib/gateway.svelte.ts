import { parse } from "devalue";
import ReconnectingWebSocket from "reconnecting-websocket";
import type { ClientAction, Message } from "trurpchat-shared";
import { log } from "$lib/log";

export class Gateway extends EventTarget {
  socket: ReconnectingWebSocket | null = null;
  connected: boolean = $state(false);
  private callbacks: Array<(data: Message) => void> = $state([]);
  oncloseCallback = () => {};
  onopenCallback = () => {};

  connect(url: string) {
    if (this.socket) {
      this.socket.close();
      this.socket = null;
    }
    const socket = new ReconnectingWebSocket(url, undefined, {
      maxReconnectionDelay: 10000,
      minReconnectionDelay: 100,
      reconnectionDelayGrowFactor: 1.3,
      connectionTimeout: 4000,
      maxRetries: Infinity,
    });

    socket.addEventListener("open", () => {
      if (this.socket !== socket) return;

      this.connected = true;
      this.onopenCallback();
      for (const callback of this.callbacks) {
        socket.addEventListener("message", (event) => {
          if (this.socket !== socket) return;

          let data: Message;
          try {
            data = parse(event.data);
          } catch (error) {
            log.error("Error parsing", event.data, "message:", error);
            return;
          }
          callback(data);
        });
      }
    });

    socket.addEventListener("close", () => {
      if (this.socket !== socket) return;

      this.connected = false;
      this.oncloseCallback();
    });

    socket.addEventListener("error", (error) => {
      if (this.socket !== socket) return;

      log.error("Error connecting to Gateway:", error);
      this.connected = false;
      this.oncloseCallback();
    });

    socket.addEventListener("message", (_) => {
      // console.log("Gateway:", _.data);
    });

    this.socket = socket;
  }

  disconnect() {
    if (!this.socket) return;

    const socket = this.socket;
    this.socket = null;
    this.connected = false;
    this.oncloseCallback();
    socket.close();
  }

  onmessage(callback: (data: Message) => void) {
    this.callbacks = [callback];
    const socket = this.socket;
    socket?.addEventListener("message", (event) => {
      if (this.socket !== socket) return;

      let data: Message;
      try {
        data = parse(event.data);
      } catch (error) {
        log.error("Error parsing", event.data, "message:", error);
        return;
      }
      if (!data.type.startsWith("rtc.")) {
        log.info("New thing!");
      }
      callback(data);
    });
  }

  onclose(callback: () => void) {
    this.oncloseCallback = callback;
  }

  onopen(callback: () => void) {
    this.onopenCallback = callback;
  }

  send(data: ClientAction) {
    try {
      this.socket?.send(JSON.stringify(data));
    } catch (error) {
      log.error("Error sending message to Gateway:", error);
    }
  }
}
