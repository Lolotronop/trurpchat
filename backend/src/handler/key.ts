import { and, eq, getColumns, isNull } from "drizzle-orm";
import { err, ok } from "neverthrow";
import type { KeyAction } from "trurpchat-shared";
import { Permission, patch, perm } from "trurpchat-shared";
import { createKey, keys, users } from "$src/db";
import { send, sendAll } from "$src/send";
import { canSession } from "./types";
import type { Handlers } from "./types";

async function refreshBackendKeys(ctx: Parameters<Handlers<KeyAction>["action.key.add"]>[0]) {
  const event = {
    type: "event.key.list" as const,
    keys: await ctx.db.select().from(keys),
  };
  patch(ctx.state, event);
}

export const keyHandlers: Handlers<KeyAction> = {
  "action.key.add": async (ctx, ws, msg) => {
    const isAdmin = canSession(ctx, ws, Permission.MANAGE_KEYS);
    if (!isAdmin && ws.data.userId !== msg.userId) {
      return err(
        new Error(
          `User ${ws.data.userId} is not admin, tryed to add key for ${msg.userId}`,
        ),
      );
    }

    const [targetUser] = await ctx.db
      .select({ id: users.id })
      .from(users)
      .where(and(eq(users.id, msg.userId), isNull(users.deletedAt)))
      .limit(1);

    if (!targetUser) {
      return err(new Error(`User ${msg.userId} not found`));
    }

    await createKey(ctx.db, msg.userId);
    await refreshBackendKeys(ctx);

    const allKeys = await ctx.db
      .select({
        ...getColumns(keys),
      })
      .from(keys)
      .innerJoin(users, eq(keys.userId, users.id))
      .where(
        and(
          isNull(users.deletedAt),
          !isAdmin ? eq(keys.userId, ws.data.userId) : undefined,
        ),
      );

    send(ws, {
      type: "event.key.list",
      keys: allKeys,
    });

    if (msg.userId !== ws.data.userId) {
      const affectedUser = ctx.clients.get(msg.userId);
      if (!affectedUser) {
        // the user is not connected
        return ok();
      }
      const userKeys = allKeys.filter((k) => k.userId !== msg.userId);
      const admins = ctx.clients
        .values()
        .filter((c) => perm.can(ctx.state, Permission.MANAGE_KEYS, c.data.userId));
      sendAll([...admins, affectedUser], {
        type: "event.key.list",
        keys: userKeys,
      });
    }
    return ok();
  },

  "action.key.remove": async (ctx, ws, msg) => {
    const isAdmin = canSession(ctx, ws, Permission.MANAGE_KEYS);
    const keyss = await ctx.db
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

    if (!isAdmin && ws.data.userId !== key.userId) {
      return err(
        new Error(
          `User ${ws.data.userId} is not admin, tryed to remove key for ${key.userId}`,
        ),
      );
    }
    await ctx.db.delete(keys).where(eq(keys.id, msg.keyId));
    await refreshBackendKeys(ctx);
    const allKeys = await ctx.db
      .select({
        ...getColumns(keys),
      })
      .from(keys)
      .innerJoin(users, eq(keys.userId, users.id))
      .where(
        and(
          isNull(users.deletedAt),
          !isAdmin ? eq(keys.userId, ws.data.userId) : undefined,
        ),
      );

    send(ws, {
      type: "event.key.list",
      keys: allKeys,
    });

    if (key.userId !== ws.data.userId) {
      const affectedUser = ctx.clients.get(key.userId);
      if (!affectedUser) {
        // the user is not connected
        return ok();
      }
      const userKeys = allKeys.filter((k) => k.userId !== key.userId);
      const admins = ctx.clients
        .values()
        .filter((c) => perm.can(ctx.state, Permission.MANAGE_KEYS, c.data.userId));
      sendAll([...admins, affectedUser], {
        type: "event.key.list",
        keys: userKeys,
      });
    }

    return ok();
  },

  "action.key.list": async (ctx, ws, __) => {
    const isAdmin = canSession(ctx, ws, Permission.MANAGE_KEYS);
    const allKeys = await ctx.db
      .select({
        ...getColumns(keys),
      })
      .from(keys)
      .innerJoin(users, eq(keys.userId, users.id))
      .where(
        and(
          isNull(users.deletedAt),
          !isAdmin ? eq(keys.userId, ws.data.userId) : undefined,
        ),
      );

    send(ws, {
      type: "event.key.list",
      keys: allKeys,
    });
    return ok();
  },
};
