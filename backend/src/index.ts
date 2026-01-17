import { env } from "bun";
import type { Message, TalkingUser, TalkingUserState } from "./types";
import { Hotel, VoiceChatInstance, type WsClient } from "./voice";
import { handleMessage, type HandlerContext } from "./handler";
import { send } from "./send";

const ctx: HandlerContext = {
  clients: new Map<number, WsClient>(),
  hotel: new Hotel(),
};
ctx.hotel.rooms.push(
  new VoiceChatInstance({
    id: 0,
    name: "Альфа",
    type: "voice",
  }),
);

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
      ctx.clients.set(ws.data.id, ws);
      ws.data.muted = false;
      ws.data.streaming = false;
      ws.data.deafened = false;

      send(ws, {
        type: "event.connected",
        id: ws.data.id,
      });
      send(ws, {
        type: "event.rooms",
        rooms: ctx.hotel.toJson(),
      });
    },

    async message(ws, raw) {
      let msg: Message;
      try {
        msg = JSON.parse(raw.toString());
      } catch (error) {
        console.error("Invalid message:", raw, error);
        return;
      }

      const result = await handleMessage(ctx, ws, msg);
      if (result.isErr()) {
        console.error("Failed to handle message:", result.error);
        console.error("Message:", msg);
        console.error("Client:", ws.data);
        return;
      }

      // TODO: add periodic pings to prune dead ctx.clients
      // TODO: probably this can be done in a more efficient way
      if (msg.type.startsWith("rtc")) {
        return;
      }
      for (const client of ctx.clients.values()) {
        send(client, {
          type: "event.rooms",
          rooms: Array.from(ctx.hotel.toJson()),
        });
      }
      console.log("Hotel status:", ctx.hotel.toJson());
    },

    close(ws) {
      ctx.hotel.remove(ws);
      ctx.clients.delete(ws.data.id);
      ctx.clients.forEach((client) => {
        send(client, {
          type: "event.rooms",
          rooms: Array.from(ctx.hotel.toJson()),
        });
      });
    },
  },
});

console.log(`WebRTC signaling server running on port ${PORT}`);
