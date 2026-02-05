import type { ServerWebSocket } from "bun";
import type { Message, RoomData, ConnectedUser } from "./types";

export type WsClient = ServerWebSocket<ConnectedUser>;

export class VoiceChatInstance {
  clients = new Set<WsClient>();
  data: RoomData;

  constructor(data: RoomData) {
    if (data.type !== "voice") {
      throw new Error(
        "Trying to initialize VoiceChatInstance with non-voice data",
      );
    }

    this.data = data;
  }

  toJson() {
    const allUsers = this.users;
    const streaming = allUsers.filter((u) => u.streaming);
    streaming.sort((a, b) => a.name.localeCompare(b.name));
    const rest = allUsers.filter((u) => !u.streaming);
    rest.sort((a, b) => a.name.localeCompare(b.name));
    return {
      ...this.data,
      users: [...streaming, ...rest],
    };
  }

  send(message: Message) {
    try {
      const json = JSON.stringify(message);
      this.clients.forEach((ws) => ws.send(json));
    } catch (error) {
      console.error(`Error sending message to room ${this.data.name}:`, error);
    }
  }

  get users() {
    return Array.from(this.clients).map((ws) => ws.data);
  }

  add(client: WsClient) {
    this.clients.add(client);
  }

  remove(client: WsClient) {
    if (this.clients.has(client)) {
      this.clients.delete(client);
    } else {
      console.log(`Client ${client.data.id} is not in room ${this.data.name}`);
    }
  }
}

export class Hotel {
  rooms: VoiceChatInstance[] = [];

  find(id: number): VoiceChatInstance | undefined {
    return this.rooms.find((room) => room.data.id === id);
  }

  toJson() {
    return this.rooms.map((room) => room.toJson());
  }

  connect(id: number, client: WsClient) {
    const room = this.rooms.find((room) => room.data.id === id);
    if (!room) {
      console.log(`Room ${id} does not exist`);
      return;
    }
    if (room.data.type !== "voice") {
      console.log(`Room ${id} is not a voice room`);
      return;
    }
    this.rooms.forEach(() => room.remove(client));
    room.add(client);
  }

  remove(client: WsClient) {
    const room = this.rooms.find((room) => room.clients.has(client));
    if (!room) {
      return;
    }
    room.remove(client);
  }

  removeById(clientId: number) {
    let room: VoiceChatInstance | undefined;
    let client: WsClient | undefined;
    for (const r of this.rooms) {
      client = r.clients.values().find((c) => c.data.id === clientId);
      if (!client) {
        continue;
      }
      room = r;
      break;
    }
    if (!client) {
      return;
    }
    if (room) {
      room.remove(client);
    }
    client.close();
  }

  roomByClient(client: WsClient) {
    const room = this.rooms.find((room) => room.clients.has(client));
    return room;
  }

  has(client: WsClient) {
    return this.roomByClient(client) !== undefined;
  }
}
