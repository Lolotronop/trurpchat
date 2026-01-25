import { err, ok } from "neverthrow";
import { eq } from "drizzle-orm";
import { sendAll } from "$src/send";
import { db, users } from "$src/db";
import type { UserAction } from "$src/types";
import type { Handlers } from "./types";

export const userHandlers: Handlers<UserAction> = {
  "action.user.rename": async (ctx, ws, msg) => {
    const isAdmin = ws.data.permissions === 1;
    if (!isAdmin && ws.data.id !== msg.userId) {
      return err(
        new Error(
          `User ${ws.data.id} is not admin, tryed to rename user for ${msg.userId}`,
        ),
      );
    }

    await db
      .update(users)
      .set({ name: msg.name })
      .where(eq(users.id, msg.userId));
    const client = ctx.clients.get(msg.userId);
    if (client) {
      client.data.name = msg.name;
    }

    const allUsers = await db.select().from(users);

    const offline = allUsers.filter((u) => !ctx.clients.has(u.id));
    const online = ctx.clients
      .values()
      .map((c) => c.data)
      .toArray();

    sendAll(ctx.clients.values(), {
      type: "event.users",
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
      type: "event.rooms",
      rooms: ctx.hotel.toJson(),
    });

    return ok();
  },
};
