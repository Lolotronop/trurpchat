import type { ServerWebSocket } from "bun";
import type { Message, User } from "./types";

type Client = ServerWebSocket<User>;

class Room {
  clients = new Set<Client>();
  constructor(public name: string) { }

  toJson() {
    const allUsers = this.users;
    const streaming = allUsers.filter((u) => u.streaming);
    streaming.sort((a, b) => a.id.localeCompare(b.id));
    const rest = allUsers.filter((u) => !u.streaming);
    rest.sort((a, b) => a.id.localeCompare(b.id));
    return {
      name: this.name,
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

class Hotel {
  rooms: Room[] = [];

  find(roomName: string): Room | undefined {
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

const hotel = new Hotel();
hotel.rooms.push(new Room("Альфа"));
hotel.rooms.push(new Room("Бета"));

const clients = new Map<string, Client>();

function generateId(): string {
  return Math.random().toString(36).substring(2, 9);
}

function j(data: Message) {
  try {
    return JSON.stringify(data);
  } catch (error) {
    console.error("Error stringifying data:", data, error);
    return "";
  }
}

Bun.serve<Partial<User>, never>({
  port: 3000,
  fetch(req, server) {
    const url = new URL(req.url);
    if (url.pathname == "/rooms") {
      const r = hotel.toJson();
      console.log("Returning to http", r);
      const res = new Response(JSON.stringify(r), { status: 200 });
      res.headers.set("Access-Control-Allow-Origin", "*");
      res.headers.set(
        "Access-Control-Allow-Methods",
        "GET, POST, PUT, DELETE, OPTIONS",
      );
      return res;
    }
    const name = url.searchParams.get("name");
    if (!name) {
      console.log("Missing name parameter");
      return new Response("Missing name parameter", { status: 400 });
    }
    const options = {
      data: { name },
    };
    if (server.upgrade(req, options)) {
      return;
    }

    return new Response("Upgrade failed", { status: 500 });
  },
  websocket: {
    open(ws) {
      ws.data.id = generateId();
      clients.set(ws.data.id, ws);
      ws.data.muted = false;
      ws.data.streaming = false;
      ws.data.deafened = false;

      ws.send(
        j({
          type: "connected",
          id: ws.data.id,
        }),
      );
      ws.send(
        j({
          type: "rooms",
          rooms: hotel.toJson(),
        }),
      );
    },

    message(ws, raw) {
      let msg: Message;
      try {
        msg = JSON.parse(raw.toString());
      } catch (error) {
        console.error("Invalid message:", raw, error);
        return;
      }

      if (msg.type === "join") {
        const room = hotel.find(msg.room);
        if (!room) {
          console.error(`Room ${msg.room} not found`);
          return;
        }
        room.add(ws);
      } else if (msg.type === "leave") {
        const room = hotel.find(msg.room);
        if (!room) {
          console.error(`Room ${msg.room} not found`);
          return;
        }
        room.remove(ws);
      } else if (msg.type === "muted") {
        ws.data.muted = msg.muted;
      } else if (msg.type === "streaming") {
        ws.data.streaming = msg.streaming;
      } else if (msg.type === "deafened") {
        ws.data.deafened = msg.deafened;
      } else if (msg.type === "watching") {
        ws.data.watching = msg.watching;
      } else if (msg.type === "pause") {
        if (ws.data.watching === null) {
          return;
        }
        // TODO: this is horrible
        const to = Array.from(clients.values()).find(
          (c) => c.data.name === ws.data.watching,
        );
        if (!to) {
          console.error(`Client ${ws.data.watching} not found`);
          return;
        }
        to.send(j(msg));
      } else if (msg.type === "rtc.ice" && msg.target) {
        const target = clients.get(msg.target);
        if (!target) {
          console.error(`Client ${msg.target} not found`);
          return;
        }
        target.send(
          j({
            type: "rtc.ice",
            candidate: msg.candidate,
            sender: ws.data.id,
          }),
        );
      } else if (msg.type === "rtc.offer" && msg.target) {
        const target = clients.get(msg.target);
        if (!target) {
          console.error(`Client ${msg.target} not found`);
          return;
        }
        target.send(
          j({
            type: "rtc.offer",
            offer: msg.offer,
            sender: ws.data.id,
          }),
        );
      } else if (msg.type === "rtc.answer" && msg.target) {
        const target = clients.get(msg.target);
        if (!target) {
          console.error(`Client ${msg.target} not found`);
          return;
        }
        target.send(
          j({
            type: "rtc.answer",
            answer: msg.answer,
            sender: ws.data.id,
          }),
        );
      }

      // TODO: probably this can be done in a more efficient way
      if (msg.type.startsWith("rtc")) {
        return;
      }
      for (const client of clients.values()) {
        client.send(
          j({
            type: "rooms",
            rooms: Array.from(hotel.toJson()),
          }),
        );
      }
      console.log("Hotel status:", hotel.toJson());
    },

    close(ws) {
      hotel.remove(ws);
      clients.delete(ws.data.id);
      clients.forEach((client) => {
        client.send(
          j({
            type: "rooms",
            rooms: Array.from(hotel.toJson()),
          }),
        );
      });
    },
  },
});

console.log("WebRTC signaling server running on port 3000");
console.log("Rooms and users will be logged as they connect/disconnect");
