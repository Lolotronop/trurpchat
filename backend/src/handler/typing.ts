import { err, ok } from "neverthrow";
import type { TypingAction } from "trurpchat-shared";
import { patch, perm } from "trurpchat-shared";
import { sendAll } from "$src/send";
import type { Handlers } from "./types";

export const typingHandlers: Handlers<TypingAction> = {
  "action.typing": async (ctx, ws, { roomId }) => {
    const room = ctx.state.rooms.find((room) => room.id === roomId);

    if (!room) {
      return err(new Error("Room not found"));
    }

    if (room.type !== "text") {
      return err(new Error("Room is not a text room"));
    }

    const can = perm.can(ctx.state, perm.bit.VIEW_ROOM, ws.data.userId, roomId);
    if (!can) {
      return err(new Error("Missing VIEW_ROOM"));
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
