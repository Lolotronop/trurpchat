import ReconnectingWebSocket from "reconnecting-websocket";

export class Gateway extends EventTarget {
  socket: ReconnectingWebSocket;
  connected: boolean = $state(false);
  constructor(url: string) {
    super();
    this.socket = new ReconnectingWebSocket(url, undefined, {
      maxReconnectionDelay: 10000,
      minReconnectionDelay: 100,
      reconnectionDelayGrowFactor: 1.3,
      connectionTimeout: 4000,
      maxRetries: Infinity,
    });

    this.socket.addEventListener("open", () => {
      console.log("Connected to Gateway");
      this.connected = true;
    });

    this.socket.addEventListener("close", () => {
      console.log("Disconnected from Gateway, retrying...");
      this.connected = false;
    });
  }

  set onmessage(callback: (data: unknown) => void) {
    this.socket.addEventListener("message", (event) => {
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

  send(data: any) {
    try {
      this.socket.send(JSON.stringify(data));
    } catch (error) {
      console.error("Error sending message:", error);
    }
  }
}
