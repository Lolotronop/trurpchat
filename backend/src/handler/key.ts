import { err, ok } from "neverthrow";
import { send, sendAll } from "$src/send";
import { createKey, db, keys, users } from "$src/db";
import type { Handlers } from "./types";
import type { KeyAction } from "$src/types";
import { and, eq, getColumns, isNull } from "drizzle-orm";

export const keyHandlers: Handlers<KeyAction> = {
  "action.key.add": async (ctx, ws, msg) => {
    const isAdmin = ws.data.permissions === 1;
    if (!isAdmin && ws.data.id !== msg.userId) {
      return err(
        new Error(
          `User ${ws.data.id} is not admin, tryed to add key for ${msg.userId}`,
        ),
      );
    }

    const [user] = await db
      .select({ id: users.id })
      .from(users)
      .where(and(eq(users.id, msg.userId), isNull(users.deletedAt)))
      .limit(1);

    if (!user) {
      return err(new Error(`User ${msg.userId} not found`));
    }

    await createKey(msg.userId);

    const allKeys = await db
      .select({
        ...getColumns(keys),
      })
      .from(keys)
      .innerJoin(users, eq(keys.userId, users.id))
      .where(
        and(
          isNull(users.deletedAt),
          !isAdmin ? eq(keys.userId, ws.data.id) : undefined,
        ),
      );

    send(ws, {
      type: "event.key.list",
      keys: allKeys,
    });

    if (msg.userId !== ws.data.id) {
      const affectedUser = ctx.clients.get(msg.userId);
      if (!affectedUser) {
        // the user is not connected
        return ok();
      }
      const userKeys = allKeys.filter((k) => k.userId !== msg.userId);
      const admins = ctx.clients
        .values()
        .filter((c) => c.data.permissions === 1);
      sendAll([...admins, affectedUser], {
        type: "event.key.list",
        keys: userKeys,
      });
    }
    return ok();
  },

  "action.key.remove": async (ctx, ws, msg) => {
    const isAdmin = ws.data.permissions === 1;
    const keyss = await db
      .select({
        ...getColumns(keys),
      })
      .from(keys)
      .innerJoin(users, eq(keys.userId, users.id))
      .where(and(eq(keys.id, msg.keyId), isNull(users.deletedAt)));
    if (keyss.length === 0 || !keyss[0]) {
      return err(new Error(`Key ${msg.keyId} not found`));
    }
    const key = keyss[0];

    if (!isAdmin && ws.data.id !== key.userId) {
      return err(
        new Error(
          `User ${ws.data.id} is not admin, tryed to remove key for ${key.userId}`,
        ),
      );
    }
    await db.delete(keys).where(eq(keys.id, msg.keyId));
    const allKeys = await db
      .select({
        ...getColumns(keys),
      })
      .from(keys)
      .innerJoin(users, eq(keys.userId, users.id))
      .where(
        and(
          isNull(users.deletedAt),
          !isAdmin ? eq(keys.userId, ws.data.id) : undefined,
        ),
      );

    send(ws, {
      type: "event.key.list",
      keys: allKeys,
    });

    if (key.userId !== ws.data.id) {
      const affectedUser = ctx.clients.get(key.userId);
      if (!affectedUser) {
        // the user is not connected
        return ok();
      }
      const userKeys = allKeys.filter((k) => k.userId !== key.userId);
      const admins = ctx.clients
        .values()
        .filter((c) => c.data.permissions === 1);
      sendAll([...admins, affectedUser], {
        type: "event.key.list",
        keys: userKeys,
      });
    }

    return ok();
  },

  "action.key.list": async (_, ws, __) => {
    const isAdmin = ws.data.permissions === 1;
    const allKeys = await db
      .select({
        ...getColumns(keys),
      })
      .from(keys)
      .innerJoin(users, eq(keys.userId, users.id))
      .where(
        and(
          isNull(users.deletedAt),
          !isAdmin ? eq(keys.userId, ws.data.id) : undefined,
        ),
      );

    send(ws, {
      type: "event.key.list",
      keys: allKeys,
    });
    return ok();
  },
};
