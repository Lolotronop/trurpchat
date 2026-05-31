import { and, eq, isNull } from "drizzle-orm";
import { err, ok } from "neverthrow";
import type { TypingAction } from "trurpchat-shared";
import { patch } from "trurpchat-shared";
import { rooms } from "$src/db";
import { sendAll } from "$src/send";
import type { Handlers } from "./types";

export const typingHandlers: Handlers<TypingAction> = {
  "action.typing": async (ctx, ws, { roomId }) => {
    const [room] = await ctx.db
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

    const event = {
      type: "event.typing" as const,
      roomId,
      userId: ws.data.userId,
      timestamp: new Date(),
    };
    patch(ctx.state, event);
    sendAll(ctx.clients.values(), event);

    return ok();
  },
};
