import { eq } from "drizzle-orm";
import { err, ok } from "neverthrow";
import type { KeyAction } from "trurpchat-shared";
import { Permission, patch, perm } from "trurpchat-shared";
import { createKey, keys } from "$src/db";
import { send, sendAll } from "$src/send";
import type { Handlers } from "./types";
import { canSession } from "./types";

function getVisibleKeys(
  ctx: Parameters<Handlers<KeyAction>["action.key.add"]>[0],
  userId: number,
  isAdmin: boolean,
) {
  return ctx.state.keys.filter((key) => isAdmin || key.userId === userId);
}

function setBackendKeys(
  ctx: Parameters<Handlers<KeyAction>["action.key.add"]>[0],
  newKeys: typeof ctx.state.keys,
) {
  patch(ctx.state, {
    type: "event.key.list" as const,
    keys: newKeys,
  });
}

export const keyHandlers: Handlers<KeyAction> = {
  "action.key.add": async (ctx, ws, msg) => {
    const canManage = canSession(ctx, ws, Permission.MANAGE_KEYS);
    const isSelf = ws.data.userId === msg.userId;
    const allow = canManage || isSelf;
    if (!allow) {
      return err(
        new Error(
          `User ${ws.data.userId} is not admin, tryed to add key for ${msg.userId}`,
        ),
      );
    }

    const targetUser = ctx.state.users.find((user) => user.id === msg.userId);

    if (!targetUser) {
      return err(new Error(`User ${msg.userId} not found`));
    }

    const key = await createKey(ctx.db, msg.userId);
    const backendKeys = [...ctx.state.keys, key];
    setBackendKeys(ctx, backendKeys);

    for (const [_, client] of ctx.clients) {
      const id = client.data.userId;
      const can = perm.can(ctx.state, Permission.MANAGE_KEYS, id);
      if (can) {
        send(client, {
          type: "event.key.list",
          keys: ctx.state.keys,
        });
      } else if (id === msg.userId) {
        const filtered = ctx.state.keys.filter(
          (key) => key.userId === msg.userId,
        );
        send(client, {
          type: "event.key.list",
          keys: filtered,
        });
      }
    }

    return ok();
  },

  "action.key.remove": async (ctx, ws, msg) => {
    const isAdmin = canSession(ctx, ws, Permission.MANAGE_KEYS);
    const key = ctx.state.keys.find((key) => key.id === msg.keyId);
    if (!key || !ctx.state.users.some((user) => user.id === key.userId)) {
      return err(new Error(`Key ${msg.keyId} not found`));
    }

    if (!isAdmin && ws.data.userId !== key.userId) {
      return err(
        new Error(
          `User ${ws.data.userId} is not admin, tryed to remove key for ${key.userId}`,
        ),
      );
    }
    await ctx.db.delete(keys).where(eq(keys.id, msg.keyId));
    setBackendKeys(
      ctx,
      ctx.state.keys.filter((key) => key.id !== msg.keyId),
    );
    const allKeys = getVisibleKeys(ctx, ws.data.userId, isAdmin);

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
        .filter((c) =>
          perm.can(ctx.state, Permission.MANAGE_KEYS, c.data.userId),
        );
      sendAll([...admins, affectedUser], {
        type: "event.key.list",
        keys: userKeys,
      });
    }

    return ok();
  },

  "action.key.list": async (ctx, ws, __) => {
    const isAdmin = canSession(ctx, ws, Permission.MANAGE_KEYS);
    const allKeys = getVisibleKeys(ctx, ws.data.userId, isAdmin);

    send(ws, {
      type: "event.key.list",
      keys: allKeys,
    });
    return ok();
  },
};
