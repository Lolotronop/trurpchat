import ReconnectingWebSocket from "reconnecting-websocket";
import type { ClientAction, Message } from "trurpchat-backend";

export class Gateway extends EventTarget {
  socket: ReconnectingWebSocket | null = null;
  connected: boolean = $state(false);
  private callbacks: Array<(data: Message) => void> = $state([]);
  oncloseCallback = () => {};
  onopenCallback = () => {};
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
      this.connected = true;
      // FIXME: because race conditions, yay!
      // it connects faster than it disconnects
      // sooo it sets to false after a reconnect
      // oh well
      setTimeout(() => (this.connected = true), 500);
      this.onopenCallback();
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
      this.oncloseCallback();
    });

    socket.addEventListener("error", (error) => {
      console.error("Error connecting to Gateway:", error);
      this.connected = false;
      this.oncloseCallback();
    });

    socket.addEventListener("message", (_) => {
      // console.log("Gateway:", _.data);
    });

    this.socket = socket;
  }

  disconnect() {
    this.socket?.close();
    this.socket = null;
  }

  onmessage(callback: (data: Message) => void) {
    this.callbacks = [callback];
    this.socket?.addEventListener("message", (event) => {
      let data: Message;
      try {
        data = JSON.parse(event.data);
      } catch (error) {
        console.error("Error parsing", event.data, "message:", error);
        return;
      }
      if (!data.type.startsWith("rtc.")) {
        console.log("New thing!");
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
      console.error("Error sending message to Gateway:", error);
    }
  }
}
