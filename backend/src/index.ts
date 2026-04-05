import { env } from "bun";
import { and, eq, getColumns, isNull } from "drizzle-orm";
import { db, getOrCreateServerId, keys, rooms, users } from "./db";
import { getKeys, seed } from "./devseed";
import { type HandlerContext, handleMessage } from "./handler";
import { removeWatcherFromAllUsers, voiceHandlers } from "./handler/voice";
import { send, sendAll } from "./send";
import type {
  ConnectedUser,
  ConnectedUserState,
  IceConfig,
  Message,
  OfflineUser,
  Room,
  User,
} from "./types";
import { Hotel, VoiceChatInstance, type WsClient } from "./voice";

await seed();
console.log(await getKeys());

const ctx: HandlerContext = {
  clients: new Map<number, WsClient>(),
  hotel: new Hotel(),
};
const existingRooms = await db
  .select()
  .from(rooms)
  .where(isNull(rooms.deletedAt));
for (const r of existingRooms) {
  if (r.type === "voice") {
    ctx.hotel.rooms.push(new VoiceChatInstance(r));
  }
}

const PORT = +(env.PORT ?? 3000);
const serverId = await getOrCreateServerId();

function isIceConfig(value: unknown): value is IceConfig {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const iceServers = (value as { iceServers?: unknown }).iceServers;
  if (!Array.isArray(iceServers)) {
    return false;
  }

  return iceServers.every((server) => {
    if (typeof server !== "object" || server === null) {
      return false;
    }

    const { urls, username, credential } = server as {
      urls?: unknown;
      username?: unknown;
      credential?: unknown;
    };

    const validUrls =
      typeof urls === "string" ||
      (Array.isArray(urls) && urls.every((url) => typeof url === "string"));

    return (
      validUrls &&
      (username === undefined || typeof username === "string") &&
      (credential === undefined || typeof credential === "string")
    );
  });
}

async function loadIceConfig() {
  const file = Bun.file(new URL("../ice.json", import.meta.url));
  const content = await file.text();

  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch (error) {
    throw new Error(`Failed to parse backend/ice.json: ${error}`);
  }

  if (!isIceConfig(parsed)) {
    throw new Error("Invalid backend/ice.json: expected { iceServers: [...] }");
  }

  return parsed;
}

const iceConfig = await loadIceConfig();

function createDefaultTalkingUserState(): ConnectedUserState {
  return {
    muted: false,
    deafened: false,
    camera: false,
    streaming: false,
    watchedBy: [],
    online: true,
  };
}

export async function getAllUsers(ctx: HandlerContext): Promise<User[]> {
  const allUsers = await db.select().from(users).where(isNull(users.deletedAt));
  const onlineUsers = ctx.clients
    .values()
    .map((c) => c.data)
    .toArray();

  const offlineUsers: OfflineUser[] = allUsers
    .filter((u) => !ctx.clients.has(u.id))
    .map((u) => ({ ...u, online: false }));

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

    const [user] = await db
      .select({
        ...getColumns(users),
      })
      .from(users)
      .leftJoin(keys, eq(users.id, keys.userId))
      .where(and(eq(keys.key, key), isNull(users.deletedAt)))
      .limit(1);

    if (!user) {
      console.log("User not found");
      return new Response("User not found", { status: 400 });
    }

    await db
      .update(keys)
      .set({ lastSeen: new Date() })
      .where(eq(keys.key, key));

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
        type: "event.startup.config",
        serverId,
        ovenServerUrl: env.OVEN_SERVER_URL,
        iceConfig,
      });

      send(ws, {
        type: "event.connected",
        user: ws.data,
      });

      const textRooms = (await db
        .select()
        .from(rooms)
        .where(
          and(eq(rooms.type, "text"), isNull(rooms.deletedAt)),
        )) as Extract<Room, { type: "text" }>[];

      const thing = [...ctx.hotel.toJson(), ...textRooms];
      send(ws, {
        type: "event.room.list",
        rooms: thing,
      });

      const users = await getAllUsers(ctx);
      send(ws, {
        type: "event.user.list",
        users,
      });

      sendAll(
        ctx.clients.values().filter((client) => client !== ws),
        {
          type: "event.user.online",
          userId: ws.data.id,
        },
      );
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
      const room = ctx.hotel.roomByClient(ws);
      if (room) {
        voiceHandlers["action.voice.leave"](ctx, ws, {
          type: "action.voice.leave",
          room: room.data.id,
        });
      }

      removeWatcherFromAllUsers(ctx, ws.data.id);

      ctx.clients.delete(ws.data.id);

      sendAll(ctx.clients.values(), {
        type: "event.user.offline",
        userId: ws.data.id,
      });
    },
  },
});

console.log(`WebRTC signaling server running on port ${PORT}`);
