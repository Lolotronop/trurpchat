import { env } from "bun";
import type { Message, TalkingUser, TalkingUserState } from "./types";
import { Hotel, VoiceChatInstance, type Client } from "./voice";

const hotel = new Hotel();
hotel.rooms.push(
  new VoiceChatInstance({
    id: 0,
    name: "Альфа",
    type: "voice",
  }),
);

const clients = new Map<number, Client>();

function json(data: Message) {
  try {
    return JSON.stringify(data);
  } catch (error) {
    console.error("Error stringifying data:", data, error);
    return "";
  }
}

const PORT = +(env.PORT ?? 3000);

function createDefaultTalkingUserState(): TalkingUserState {
  return {
    muted: false,
    deafened: false,
    streaming: false,
    watching: null,
  };
}

Bun.serve<TalkingUser, never>({
  port: PORT,
  fetch(req, server) {
    const url = new URL(req.url);

    const name = url.searchParams.get("name");

    if (!name) {
      console.log("Missing name parameter");
      return new Response("Missing name parameter", { status: 400 });
    }

    const user: TalkingUser = {
      id: Math.random(),
      name,
      permissions: 0,
      ...createDefaultTalkingUserState(),
    };

    const options = {
      data: user,
    };

    if (server.upgrade(req, options)) {
      return;
    }

    return new Response("Upgrade failed", { status: 500 });
  },
  websocket: {
    open(ws) {
      ws.data.id = Math.random();
      clients.set(ws.data.id, ws);
      ws.data.muted = false;
      ws.data.streaming = false;
      ws.data.deafened = false;

      ws.send(
        json({
          type: "event.connected",
          id: ws.data.id,
        }),
      );
      ws.send(
        json({
          type: "event.rooms",
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

      // TODO: add periodic pings to prune dead clients
      if (msg.type === "action.voice.join") {
        const room = hotel.find(msg.room);
        if (!room) {
          console.error(`Room ${msg.room} not found`);
          return;
        }
        room.add(ws);
      } else if (msg.type === "action.voice.leave") {
        const room = hotel.find(msg.room);
        if (!room) {
          console.error(`Room ${msg.room} not found`);
          return;
        }
        room.remove(ws);
      } else if (msg.type === "action.voice.mute") {
        ws.data.muted = msg.muted;
      } else if (msg.type === "action.voice.stream") {
        ws.data.streaming = msg.streaming;
      } else if (msg.type === "action.voice.deafen") {
        ws.data.deafened = msg.deafened;
      } else if (msg.type === "action.voice.watch") {
        ws.data.watching = msg.watching;
      } else if (msg.type === "action.voice.pause") {
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
        to.send(json(msg));
      } else if (msg.type === "rtc.ice" && msg.target) {
        const target = clients.get(msg.target);
        if (!target) {
          console.error(`Client ${msg.target} not found`);
          return;
        }
        target.send(
          json({
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
          json({
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
          json({
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
          json({
            type: "event.rooms",
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
          json({
            type: "event.rooms",
            rooms: Array.from(hotel.toJson()),
          }),
        );
      });
    },
  },
});

console.log(`WebRTC signaling server running on port ${PORT}`);
console.log("Rooms and users will be logged as they connect/disconnect");
