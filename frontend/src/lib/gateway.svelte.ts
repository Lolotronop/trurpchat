import ReconnectingWebSocket from "reconnecting-websocket";
import type { UserAction, Message } from "trurpchat-backend";

export class Gateway extends EventTarget {
  socket: ReconnectingWebSocket | null = null;
  connected: boolean = $state(false);
  private callbacks: Array<(data: Message) => void> = $state([]);
  constructor() {
    super();
  }

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
      console.log("Connected to Gateway");
      this.connected = true;
      // FIXME: because race conditions, yay!
      // it connects faster than it disconnects
      // sooo it sets to false after a reconnect
      // oh well
      setTimeout(() => (this.connected = true), 500);
      for (const callback of this.callbacks) {
        socket.addEventListener("message", (event) => {
          let data: Message;
          try {
            data = JSON.parse(event.data);
          } catch (error) {
            console.error("Error parsing", event.data, "message:", error);
            return;
          }
          callback(data);
        });
      }
    });

    socket.addEventListener("close", () => {
      this.connected = false;
    });

    socket.addEventListener("error", (error) => {
      console.error("Error connecting to Gateway:", error);
      this.connected = false;
    });

    socket.addEventListener("message", (event) => {
      console.log("Gateway:", event.data);
    });

    this.socket = socket;
  }

  disconnect() {
    this.socket?.close();
    this.socket = null;
  }

  onmessage(callback: (data: Message) => void) {
    this.callbacks.push(callback);
    this.socket?.addEventListener("message", (event) => {
      let data: Message;
      try {
        data = JSON.parse(event.data);
      } catch (error) {
        console.error("Error parsing", event.data, "message:", error);
        return;
      }
      callback(data);
    });
  }

  send(data: UserAction) {
    try {
      this.socket?.send(JSON.stringify(data));
    } catch (error) {
      console.error("Error sending message to Gateway:", error);
    }
  }
}
