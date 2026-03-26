import { env } from "bun";
import { eq, getColumns } from "drizzle-orm";
import type {
  Message,
  ConnectedUser,
  ConnectedUserState,
  User,
  Room,
} from "./types";
import { Hotel, VoiceChatInstance, type WsClient } from "./voice";
import { handleMessage, type HandlerContext } from "./handler";
import { send, sendAll } from "./send";
import { db, keys, rooms, users } from "./db";
import { getKeys, seed } from "./devseed";
import { voiceHandlers } from "./handler/voice";

await seed();
console.log(await getKeys());

const ctx: HandlerContext = {
  clients: new Map<number, WsClient>(),
  hotel: new Hotel(),
};
const existingRooms = await db.select().from(rooms);
for (const r of existingRooms) {
  if (r.type === "voice") {
    ctx.hotel.rooms.push(new VoiceChatInstance(r));
  }
}

const PORT = +(env.PORT ?? 3000);

function createDefaultTalkingUserState(): ConnectedUserState {
  return {
    muted: false,
    deafened: false,
    camera: false,
    streaming: false,
    watching: null,
    online: true,
  };
}

export async function getAllUsers(
  ctx: HandlerContext,
): Promise<(User | ConnectedUser)[]> {
  const allUsers = await db.query.users.findMany();
  const onlineUsers = ctx.clients
    .values()
    .map((c) => c.data)
    .toArray();

  const offlineUsers = allUsers.filter((u) => !ctx.clients.has(u.id));

  return [...onlineUsers, ...offlineUsers];
}

Bun.serve<ConnectedUser, never>({
  port: PORT,
  async fetch(req, server) {
    const url = new URL(req.url);

    const key = url.searchParams.get("key");
    if (!key) {
      console.log("Missing key parameter");
      return new Response("Missing key parameter", { status: 400 });
    }

    const userRow = await db
      .select({
        ...getColumns(users),
      })
      .from(users)
      .leftJoin(keys, eq(users.id, keys.userId))
      .where(eq(keys.key, key))
      .limit(1);

    if (userRow.length === 0) {
      console.log("User not found");
      return new Response("User not found", { status: 400 });
    }

    await db
      .update(keys)
      .set({ lastSeen: new Date() })
      .where(eq(keys.key, key));

    const user = userRow[0]!;
    ctx.hotel.removeById(user.id);

    const options = {
      data: {
        ...user,
        ...createDefaultTalkingUserState(),
      },
    };

    if (server.upgrade(req, options)) {
      return;
    }

    return new Response("Upgrade failed", { status: 500 });
  },
  websocket: {
    async open(ws) {
      ctx.clients.set(ws.data.id, ws);

      send(ws, {
        type: "event.connected",
        user: ws.data,
      });

      const textRooms = (await db
        .select()
        .from(rooms)
        .where(eq(rooms.type, "text"))) as Extract<Room, { type: "text" }>[];

      const thing = [...ctx.hotel.toJson(), ...textRooms];
      send(ws, {
        type: "event.room.list",
        rooms: thing,
      });

      const ovenServerUrl = env.OVEN_SERVER_URL;
      if (ovenServerUrl) {
        send(ws, {
          type: "event.oven",
          ovenServerUrl,
        });
      }

      const users = await getAllUsers(ctx);
      sendAll(ctx.clients.values(), {
        type: "event.user.list",
        users,
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
    },

    async close(ws) {
      let room = ctx.hotel.roomByClient(ws);
      if (room) {
        voiceHandlers["action.voice.leave"](ctx, ws, {
          type: "action.voice.leave",
          room: room.data.id,
        });
      }

      ctx.clients.delete(ws.data.id);

      const users = await getAllUsers(ctx);
      sendAll(ctx.clients.values(), {
        type: "event.user.list",
        users,
      });
    },
  },
});

console.log(`WebRTC signaling server running on port ${PORT}`);
