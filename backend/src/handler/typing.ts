import { and, eq, isNull } from "drizzle-orm";
import { err, ok } from "neverthrow";
import { db, rooms } from "$src/db";
import { sendAll } from "$src/send";
import type { TypingAction } from "$src/types";
import type { Handlers } from "./types";

export const typingHandlers: Handlers<TypingAction> = {
  "action.typing": async (ctx, ws, { roomId }) => {
    const [room] = await db
      .select()
      .from(rooms)
      .where(and(eq(rooms.id, roomId), isNull(rooms.deletedAt)))
      .limit(1);

    if (!room) {
      return err(new Error("Room not found"));
    }

    if (room.type !== "text") {
      return err(new Error("Room is not a text room"));
    }

    sendAll(ctx.clients.values(), {
      type: "event.typing",
      roomId,
      userId: ws.data.id,
      timestamp: new Date(),
    });

    return ok();
  },
};
