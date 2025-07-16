import ReconnectingWebSocket from "reconnecting-websocket";
import type { Message } from "../../src-backend/types";

export class Gateway extends EventTarget {
  socket: ReconnectingWebSocket | null = null;
  connected: boolean = $state(false);
  private callbacks: Array<(data: unknown) => void> = $state([]);
  constructor() {
    super();
  }

  connect(url: string) {
    this.connected = false;
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
      console.log("Connected to Gateway");
      for (const callback of this.callbacks) {
        socket.addEventListener("message", (event) => {
          let data: string;
          try {
            data = JSON.parse(event.data);
          } catch (error) {
            console.error("Error parsing", event.data, "message:", error);
            return;
          }
          callback(data);
        });
      }
      this.connected = true;
    });

    socket.addEventListener("close", () => {
      console.log("Disconnected from Gateway, retrying...");
      this.connected = false;
    });

    socket.addEventListener("error", (error) => {
      console.error("Error connecting to Gateway:", error);
    });

    this.socket = socket;
  }

  set onmessage(callback: (data: unknown) => void) {
    this.callbacks.push(callback);
    this.socket?.addEventListener("message", (event) => {
      let data: string;
      try {
        data = JSON.parse(event.data);
      } catch (error) {
        console.error("Error parsing", event.data, "message:", error);
        return;
      }
      callback(data);
    });
  }

  send(data: Message) {
    try {
      this.socket?.send(JSON.stringify(data));
    } catch (error) {
      console.error("Error sending message to Gateway:", error);
    }
  }
}
