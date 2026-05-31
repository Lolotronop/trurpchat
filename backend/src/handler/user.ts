import { and, eq, isNull } from "drizzle-orm";
import { err, ok } from "neverthrow";
import type { UserAction } from "trurpchat-shared";
import {
  connectedUser,
  user as findUser,
  Permission,
  patch,
  perm,
} from "trurpchat-shared";
import { createKey, keys, userRoles, users } from "$src/db";
import { send, sendAll } from "$src/send";
import type { Handlers } from "./types";
import { canSession } from "./types";

export const userHandlers: Handlers<UserAction> = {
  "action.user.create": async (ctx, ws, msg) => {
    const isAdmin = canSession(ctx, ws, Permission.MANAGE_USERS);
    if (!isAdmin) {
      return err(
        new Error(`User ${ws.data.userId} is not admin, tryed to create user`),
      );
    }

    const [user] = await ctx.db
      .insert(users)
      .values([
        {
          name: msg.name,
        },
      ])
      .returning();

    if (!user) {
      return err(new Error(`Failed to create user ${msg.name}`));
    }

    const key = await createKey(ctx.db, user.id);

    const createdEvent = {
      type: "event.user.created" as const,
      user: {
        ...user,
        online: false as const,
      },
    };
    patch(ctx.state, createdEvent);
    patch(ctx.state, {
      type: "event.key.list" as const,
      keys: [...ctx.state.keys, key],
    });
    sendAll(ctx.clients.values(), createdEvent);

    const admins = ctx.clients
      .values()
      .filter((c) =>
        perm.can(ctx.state, Permission.MANAGE_KEYS, c.data.userId),
      );
    sendAll(admins, {
      type: "event.key.list",
      keys: ctx.state.keys,
    });

    return ok();
  },

  "action.user.state": async (ctx, ws, msg) => {
    const { type: _type, ...data } = msg;
    const me = connectedUser(ctx.state, ws.data.userId);
    if (!me) {
      return err(new Error(`User ${ws.data.userId} is not connected`));
    }
    // prevent user from spoofing their watched by list
    if (data.watchedBy) delete data.watchedBy;
    if (data.streaming || data.camera) {
      const voiceRoom = ctx.state.voiceUsers.find(
        (entry) => entry.userId === ws.data.userId,
      );
      if (
        !voiceRoom ||
        !canSession(ctx, ws, Permission.STREAM, voiceRoom.roomId)
      ) {
        return err(new Error("Missing STREAM"));
      }
    }
    Object.assign(me, data);

    const event = {
      type: "event.user.state" as const,
      user: me,
    };
    patch(ctx.state, event);
    sendAll(ctx.clients.values(), event);

    return ok();
  },

  "action.user.update": async (ctx, ws, msg) => {
    const isAdmin = canSession(ctx, ws, Permission.MANAGE_USERS);
    if (!isAdmin && ws.data.userId !== msg.id) {
      return err(
        new Error(
          `User ${ws.data.userId} is not admin, tryed to rename user for ${msg.id}`,
        ),
      );
    }

    const { id: _id, type: _type, ...rest } = msg;
    const updated = await ctx.db
      .update(users)
      .set(rest)
      .where(and(eq(users.id, msg.id), isNull(users.deletedAt)))
      .returning();
    const user = updated[0];
    if (!user) {
      return err(new Error(`User ${msg.id} not found`));
    }

    const client = ctx.clients.get(msg.id);
    if (client) {
      const stateUser = findUser(ctx.state, msg.id);
      const meEvent = {
        type: "event.user.me" as const,
        user: stateUser ?? { ...user, online: false as const },
      };
      send(client, meEvent);
      const clientIsAdmin = perm.can(ctx.state, Permission.MANAGE_KEYS, msg.id);
      const userKeys = ctx.state.keys.filter(
        (key) => clientIsAdmin || key.userId === msg.id,
      );
      send(client, {
        type: "event.key.list",
        keys: userKeys,
      });
    }

    const updatedEvent = {
      type: "event.user.updated" as const,
      user,
    };
    patch(ctx.state, updatedEvent);
    sendAll(ctx.clients.values(), updatedEvent);

    return ok();
  },

  "action.user.delete": async (ctx, ws, msg) => {
    const isAdmin = canSession(ctx, ws, Permission.MANAGE_USERS);
    if (!isAdmin && ws.data.userId !== msg.id) {
      return err(
        new Error(
          `User ${ws.data.userId} is not admin, tryed to delete user for ${msg.id}`,
        ),
      );
    }

    await ctx.db.delete(keys).where(eq(keys.userId, msg.id));
    await ctx.db.delete(userRoles).where(eq(userRoles.userId, msg.id));

    // this has to be done after the keys are already deleted
    // otherwise the client might reconnect
    const client = ctx.clients.get(msg.id);
    if (client) {
      // this should trigger the client to disconnect
      // and the handler in index.ts will handle it
      client.close();
    }

    const deleted = await ctx.db
      .update(users)
      .set({ deletedAt: new Date() })
      .where(and(eq(users.id, msg.id), isNull(users.deletedAt)))
      .returning({ id: users.id });

    if (deleted.length === 0) {
      return err(new Error(`User ${msg.id} not found`));
    }

    const deletedEvent = {
      type: "event.user.deleted" as const,
      userId: msg.id,
    };
    patch(ctx.state, deletedEvent);
    sendAll(ctx.clients.values(), deletedEvent);

    return ok();
  },
};
