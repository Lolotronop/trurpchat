import { and, eq, getColumns, isNull } from "drizzle-orm";
import { err, ok } from "neverthrow";
import type { UserAction } from "trurpchat-shared";
import { connectedUser, user as findUser, patch } from "trurpchat-shared";
import { createKey, db, keys, userRoles, users } from "$src/db";
import { send, sendAll } from "$src/send";
import type { Handlers } from "./types";
import { isSessionAdmin } from "./types";

export const userHandlers: Handlers<UserAction> = {
  "action.user.create": async (ctx, ws, msg) => {
    const isAdmin = isSessionAdmin(ctx, ws);
    if (!isAdmin) {
      return err(
        new Error(`User ${ws.data.userId} is not admin, tryed to create user`),
      );
    }

    const [user] = await db
      .insert(users)
      .values([
        {
          name: msg.name,
          permissions: 0,
        },
      ])
      .returning();

    if (!user) {
      return err(new Error(`Failed to create user ${msg.name}`));
    }

    await createKey(user.id);

    const createdEvent = {
      type: "event.user.created" as const,
      user: {
        ...user,
        online: false as const,
      },
    };
    patch(ctx.state, createdEvent);
    sendAll(ctx.clients.values(), createdEvent);

    const admins = ctx.clients
      .values()
      .filter((c) => findUser(ctx.state, c.data.userId)?.permissions === 1);
    sendAll(admins, {
      type: "event.key.list",
      keys: await db
        .select({
          ...getColumns(keys),
        })
        .from(keys)
        .innerJoin(users, eq(keys.userId, users.id))
        .where(isNull(users.deletedAt)),
    });

    return ok();
  },

  "action.user.state": async (ctx, ws, msg) => {
    const { type: _type, ...data } = msg;
    const me = connectedUser(ctx.state, ws.data.userId);
    if (!me) {
      return err(new Error(`User ${ws.data.userId} is not connected`));
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
    const isAdmin = isSessionAdmin(ctx, ws);
    if (!isAdmin && ws.data.userId !== msg.id) {
      return err(
        new Error(
          `User ${ws.data.userId} is not admin, tryed to rename user for ${msg.id}`,
        ),
      );
    }

    if (!isAdmin && msg.permissions) {
      return err(
        new Error(
          `User ${ws.data.userId} is not admin, tryed to change permissions for ${msg.id}`,
        ),
      );
    }

    const { id: _id, type: _type, ...rest } = msg;
    const updated = await db
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
      const clientIsAdmin = user.permissions === 1;
      const userKeys = await db
        .select()
        .from(keys)
        .where(!clientIsAdmin ? eq(keys.userId, msg.id) : undefined);
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
    const isAdmin = isSessionAdmin(ctx, ws);
    if (!isAdmin && ws.data.userId !== msg.id) {
      return err(
        new Error(
          `User ${ws.data.userId} is not admin, tryed to delete user for ${msg.id}`,
        ),
      );
    }

    await db.delete(keys).where(eq(keys.userId, msg.id));
    await db.delete(userRoles).where(eq(userRoles.userId, msg.id));

    // this has to be done after the keys are already deleted
    // otherwise the client might reconnect
    const client = ctx.clients.get(msg.id);
    if (client) {
      // this should trigger the client to disconnect
      // and the handler in index.ts will handle it
      client.close();
    }

    const deleted = await db
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
