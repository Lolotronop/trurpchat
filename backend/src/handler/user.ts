import { err, ok } from "neverthrow";
import { eq } from "drizzle-orm";
import { send, sendAll } from "$src/send";
import { createKey, db, keys, users } from "$src/db";
import type { UserAction } from "$src/types";
import type { Handlers } from "./types";

export const userHandlers: Handlers<UserAction> = {
  "action.user.create": async (ctx, ws, msg) => {
    const isAdmin = ws.data.permissions === 1;
    if (!isAdmin) {
      return err(
        new Error(`User ${ws.data.id} is not admin, tryed to create user`),
      );
    }

    const user = await db
      .insert(users)
      .values([
        {
          name: msg.name,
          permissions: 0,
        },
      ])
      .returning();
    await createKey(user[0]!.id);

    sendAll(ctx.clients.values(), {
      type: "event.user.created",
      user: {
        ...user[0]!,
        online: false,
      },
    });

    const admins = ctx.clients.values().filter((c) => c.data.permissions === 1);
    sendAll(admins, {
      type: "event.key.list",
      keys: await db.select().from(keys),
    });

    return ok();
  },

  "action.user.state": async (_ctx, ws, msg) => {
    const { type: _type, ...data } = msg;
    ws.data = { ...ws.data, ...data };

    sendAll(_ctx.clients.values(), {
      type: "event.user.state",
      user: ws.data,
    });

    return ok();
  },

  "action.user.update": async (ctx, ws, msg) => {
    const isAdmin = ws.data.permissions === 1;
    if (!isAdmin && ws.data.id !== msg.id) {
      return err(
        new Error(
          `User ${ws.data.id} is not admin, tryed to rename user for ${msg.id}`,
        ),
      );
    }

    if (!isAdmin && msg.permissions) {
      return err(
        new Error(
          `User ${ws.data.id} is not admin, tryed to change permissions for ${msg.id}`,
        ),
      );
    }

    const { id: _id, type: _type, ...rest } = msg;
    const updated = await db
      .update(users)
      .set(rest)
      .where(eq(users.id, msg.id))
      .returning();
    const user = updated[0];
    if (!user) {
      return err(new Error(`User ${msg.id} not found`));
    }

    const client = ctx.clients.get(msg.id);
    if (client) {
      client.data = { ...client.data, ...user };
      send(client, {
        type: "event.user.me",
        user: client.data,
      });
      const clientIsAdmin = client.data.permissions === 1;
      const userKeys = await db
        .select()
        .from(keys)
        .where(!clientIsAdmin ? eq(keys.userId, msg.id) : undefined);
      send(client, {
        type: "event.key.list",
        keys: userKeys,
      });
    }

    sendAll(ctx.clients.values(), {
      type: "event.user.updated",
      user,
    });

    return ok();
  },

  "action.user.delete": async (ctx, ws, msg) => {
    const isAdmin = ws.data.permissions === 1;
    if (!isAdmin && ws.data.id !== msg.id) {
      return err(
        new Error(
          `User ${ws.data.id} is not admin, tryed to delete user for ${msg.id}`,
        ),
      );
    }

    await db.delete(keys).where(eq(keys.userId, msg.id));

    // this has to be done after the keys are already deleted
    // otherwise the client might reconnect
    const client = ctx.clients.get(msg.id);
    if (client) {
      // this should trigger the client to disconnect
      // and the handler in index.ts will handle it
      client.close();
    }

    // TODO: we should do soft deletions here
    await db.delete(users).where(eq(users.id, msg.id));

    sendAll(ctx.clients.values(), {
      type: "event.user.deleted",
      userId: msg.id,
    });

    return ok();
  },
};
