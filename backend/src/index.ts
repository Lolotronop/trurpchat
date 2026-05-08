import { env } from "bun";
import { and, eq, getColumns, gte, isNull } from "drizzle-orm";
import type {
  ConnectedUser,
  IceConfig,
  Message,
  OfflineUser,
  User,
} from "trurpchat-shared";
import { createSharedState, defaultConnectedUserState, mentions, patch, user } from "trurpchat-shared";
import {
  db,
  getOrCreateServerId,
  keys,
  messages,
  roles,
  rooms,
  unread,
  userRoles,
  users,
} from "./db";
import { getKeys, seed } from "./devseed";
import { type HandlerContext, handleMessage } from "./handler";
import { sendRoleList } from "./handler/role";
import { removeWatcherFromAllUsers, voiceHandlers } from "./handler/voice";
import { send, sendAll } from "./send";
import { voiceRoomByUserId, type WsClient, type WsData } from "./voice";

await seed();
console.log(await getKeys());

const ctx: HandlerContext = {
  clients: new Map<number, WsClient>(),
  state: createSharedState(),
};
ctx.state.rooms.push(
  ...(await db.select().from(rooms).where(isNull(rooms.deletedAt))),
);
ctx.state.users.push(
  ...(
    await db.select().from(users).where(isNull(users.deletedAt))
  ).map((user): OfflineUser => ({ ...user, online: false })),
);
ctx.state.keys.push(...(await db.select().from(keys)));
ctx.state.roles.push(...(await db.select().from(roles).where(isNull(roles.deletedAt))));
ctx.state.userRoles.push(...(await db.select().from(userRoles)));

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

export async function getAllUsers(ctx: HandlerContext): Promise<User[]> {
  const allUsers = await db.select().from(users).where(isNull(users.deletedAt));
  const offlineUsers: OfflineUser[] = allUsers
    .filter((u) => !ctx.clients.has(u.id))
    .map((u) => ({ ...u, online: false }));

  return [
    ...ctx.clients
      .keys()
      .flatMap((id) => {
        const found = user(ctx.state, id);
        return found ? [found] : [];
      })
      .toArray(),
    ...offlineUsers,
  ];
}

Bun.serve<WsData, never>({
  port: PORT,
  async fetch(req, server) {
    const url = new URL(req.url);

    const key = url.searchParams.get("key");
    if (!key) {
      console.log("Missing key parameter");
      return new Response("Missing key parameter", { status: 400 });
    }

    const [dbUser] = await db
      .select({
        ...getColumns(users),
      })
      .from(users)
      .leftJoin(keys, eq(users.id, keys.userId))
      .where(and(eq(keys.key, key), isNull(users.deletedAt)))
      .limit(1);

    if (!dbUser) {
      console.log("User not found");
      return new Response("User not found", { status: 400 });
    }

    await db
      .update(keys)
      .set({ lastSeen: new Date() })
      .where(eq(keys.key, key));

    const existingClient = ctx.clients.get(dbUser.id);
    if (existingClient) {
      existingClient.close();
    }

    const options = {
      data: {
        userId: dbUser.id,
      },
    };

    if (server.upgrade(req, options)) {
      return;
    }

    return new Response("Upgrade failed", { status: 500 });
  },
  websocket: {
    async open(ws) {
      ctx.clients.set(ws.data.userId, ws);
      const me = user(ctx.state, ws.data.userId);
      if (!me) {
        ws.close();
        return;
      }
      Object.assign(me, defaultConnectedUserState());

      send(ws, {
        type: "event.startup.config",
        serverId,
        ovenServerUrl: env.OVEN_SERVER_URL,
        iceConfig,
      });

      send(ws, {
        type: "event.connected",
        user: me as ConnectedUser,
      });

      send(ws, {
        type: "event.room.list",
        rooms: ctx.state.rooms,
      });
      for (const voiceUser of ctx.state.voiceUsers) {
        send(ws, {
          type: "event.voice.joined",
          room: voiceUser.roomId,
          userId: voiceUser.userId,
        });
      }

      const unreadRows = await db
        .select()
        .from(unread)
        .where(eq(unread.userId, ws.data.userId));

      const assignedRoles = await db
        .select({ roleId: userRoles.roleId })
        .from(userRoles)
        .where(eq(userRoles.userId, ws.data.userId));
      const roleIds = assignedRoles.map((assignment) => assignment.roleId);

      const unreadPromises = unreadRows.map(async (u) => {
        const msgs = await db
          .select()
          .from(messages)
          .where(
            and(
              eq(messages.roomId, u.roomId),
              gte(messages.id, u.unreadId),
              eq(messages.hasMention, true),
            ),
          );

        let mentiones = 0;
        for (let i = 0; i < msgs.length; i++) {
          const m = msgs[i];
          if (!m) continue;

          const mentionsUser = mentions.user.includes(m.text, ws.data.userId);
          const mentionsRole = roleIds.some((roleId) =>
            mentions.role.includes(m.text, roleId),
          );

          if (mentionsUser || mentionsRole) {
            mentiones++;
          }
        }
        return { ...u, mentiones };
      });

      const usersUnread = await Promise.all(unreadPromises);

      send(ws, {
        type: "event.message.unread.list",
        unread: usersUnread,
      });

      await sendRoleList(ws);

      const users = await getAllUsers(ctx);
      send(ws, {
        type: "event.user.list",
        users,
      });

      const onlineEvent = {
        type: "event.user.online" as const,
        userId: ws.data.userId,
      };
      patch(ctx.state, onlineEvent);
      sendAll(
        ctx.clients.values().filter((client) => client !== ws),
        onlineEvent,
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
      const room = voiceRoomByUserId(ctx.state, ws.data.userId);
      if (room) {
        voiceHandlers["action.voice.leave"](ctx, ws, {
          type: "action.voice.leave",
          room: room.roomId,
        });
      }

      removeWatcherFromAllUsers(ctx, ws.data.userId);

      ctx.clients.delete(ws.data.userId);

      const event = {
        type: "event.user.offline" as const,
        userId: ws.data.userId,
      };
      patch(ctx.state, event);
      sendAll(ctx.clients.values(), event);
    },
  },
});

console.log(`WebRTC signaling server running on port ${PORT}`);
