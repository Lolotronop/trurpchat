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

    const allUsers = await db.select().from(users);

    const offline = allUsers.filter((u) => !ctx.clients.has(u.id));
    const online = ctx.clients
      .values()
      .map((c) => c.data)
      .toArray();

    sendAll(ctx.clients.values(), {
      type: "event.user.list",
      online,
      offline,
    });

    const admins = ctx.clients.values().filter((c) => c.data.permissions === 1);
    sendAll(admins, {
      type: "event.key.list",
      keys: await db.select().from(keys),
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
    await db.update(users).set(rest).where(eq(users.id, msg.id));
    const client = ctx.clients.get(msg.id);
    if (client) {
      client.data = { ...client.data, ...msg };
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

    const allUsers = await db.select().from(users);

    const offline = allUsers.filter((u) => !ctx.clients.has(u.id));
    const online = ctx.clients
      .values()
      .map((c) => c.data)
      .toArray();

    sendAll(ctx.clients.values(), {
      type: "event.user.list",
      online,
      offline,
    });

    if (!client) {
      return ok();
    }

    const room = ctx.hotel.roomByClient(client);
    if (!room) {
      return ok();
    }

    sendAll(ctx.clients.values(), {
      type: "event.room.list",
      rooms: ctx.hotel.toJson(),
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

    // TODO: we should do soft deletions here
    await db.delete(keys).where(eq(keys.userId, msg.id));

    // this has to be done after the keys are deleted
    const client = ctx.clients.get(msg.id);
    if (client) {
      const room = ctx.hotel.roomByClient(client);
      if (room) {
        room.remove(client);

        sendAll(ctx.clients.values(), {
          type: "event.room.list",
          rooms: ctx.hotel.toJson(),
        });
      }
      client.close();
      ctx.clients.delete(msg.id);
    }

    await db.delete(users).where(eq(users.id, msg.id));

    const allUsers = await db.select().from(users);

    const offline = allUsers.filter((u) => !ctx.clients.has(u.id));
    const online = ctx.clients
      .values()
      .map((c) => c.data)
      .toArray();

    sendAll(ctx.clients.values(), {
      type: "event.user.list",
      online,
      offline,
    });

    return ok();
  },
};
