import type { ServerWebSocket } from "bun";
import type { Message, RoomData, TalkingUser } from "./types";

export type Client = ServerWebSocket<TalkingUser>;

export class VoiceChatInstance implements RoomData {
  clients = new Set<Client>();
  id: number;
  name: string;
  type: "voice";

  constructor(data: RoomData) {
    if (data.type !== "voice") {
      throw new Error(
        "Trying to initialize VoiceChatInstance with non-voice data",
      );
    }

    this.name = data.name;
    this.id = data.id;
    this.type = data.type;
  }

  toJson() {
    const allUsers = this.users;
    const streaming = allUsers.filter((u) => u.streaming);
    streaming.sort((a, b) => a.name.localeCompare(b.name));
    const rest = allUsers.filter((u) => !u.streaming);
    rest.sort((a, b) => a.name.localeCompare(b.name));
    return {
      id: this.id,
      name: this.name,
      type: this.type,
      users: [...streaming, ...rest],
    };
  }

  send(message: Message) {
    try {
      const json = JSON.stringify(message);
      this.clients.forEach((ws) => ws.send(json));
    } catch (error) {
      console.error(`Error sending message to room ${this.name}:`, error);
    }
  }

  get users() {
    return Array.from(this.clients).map((ws) => ws.data);
  }

  add(client: Client) {
    this.clients.add(client);
    this.send({
      type: "joined",
      room: this.name,
      user: client.data,
    });
  }

  remove(client: Client) {
    if (this.clients.has(client)) {
      this.send({
        type: "left",
        room: this.name,
        user: client.data,
      });
      this.clients.delete(client);
    } else {
      console.log(`Client ${client.data.id} is not in room ${this.name}`);
    }
  }
}

export class Hotel {
  rooms: VoiceChatInstance[] = [];

  find(roomName: string): VoiceChatInstance | undefined {
    return this.rooms.find((room) => room.name === roomName);
  }

  toJson() {
    return this.rooms.map((room) => room.toJson());
  }

  connect(roomName: string, client: Client) {
    const room = this.rooms.find((room) => room.name === roomName);
    if (!room) {
      console.log(`Room ${roomName} does not exist`);
      return;
    }
    this.rooms.forEach(() => room.remove(client));
    room.add(client);
  }

  remove(client: Client) {
    const room = this.rooms.find((room) => room.clients.has(client));
    if (!room) {
      console.log(`Client ${client.data.id} is not in a room`);
      return;
    }
    room.remove(client);
  }
}
