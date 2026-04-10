import { and, eq, gte, isNull, lt } from "drizzle-orm";
import { err, ok } from "neverthrow";
import { db, messages, rooms, unread } from "$src/db";
import { send, sendAll } from "$src/send";
import type { MessageAction } from "$src/types";
import type { Handlers } from "./types";

export function userMention(userId: number) {
  return `<@${userId}>`;
}

export const messageHandlers: Handlers<MessageAction> = {
  "action.message.create": async (ctx, ws, { roomId, text, replyTo }) => {
    const userId = ws.data.id;

    if (text.length === 0) {
      return err(new Error("Message text is empty"));
    }

    if (text.length > 1000) {
      return err(new Error("Message text is too long"));
    }

    if (replyTo) {
      const replyToMessage = await db
        .select()
        .from(messages)
        .where(and(eq(messages.id, replyTo), eq(messages.roomId, roomId)))
        .limit(1);

      if (!replyToMessage) {
        return err(new Error("Reply to message not found"));
      }
    }

    const result = await db.transaction(async (tx) => {
      const [lastIdRow] = await tx
        .select({ nextMessageId: rooms.nextMessageId })
        .from(rooms)
        .where(and(eq(rooms.id, roomId), isNull(rooms.deletedAt)))
        .limit(1);

      if (!lastIdRow) {
        return [];
      }

      const id = lastIdRow.nextMessageId;
      // TODO: consolidate this
      const regex = /<@[0-9]+>/g;
      const hasMention = regex.test(text);

      await tx
        .update(rooms)
        .set({ nextMessageId: id + 1 })
        .where(and(eq(rooms.id, roomId), isNull(rooms.deletedAt)));

      return tx
        .insert(messages)
        .values({
          id,
          roomId,
          userId,
          text,
          replyTo,
          hasMention,
        })
        .returning();
    });

    const [message] = result;
    if (!message) {
      return err(new Error("Failed to create message. Room doens't exist"));
    }

    sendAll(ctx.clients.values(), {
      type: "event.message.created",
      message,
    });

    return ok();
  },

  "action.message.edit": async (ctx, ws, { roomId, id, text }) => {
    const userId = ws.data.id;
    const hasMention = text.includes(userMention(userId));

    const [message] = await db
      .update(messages)
      .set({ text, editedAt: new Date(), hasMention })
      .where(
        and(
          eq(messages.id, id),
          eq(messages.roomId, roomId),
          eq(messages.userId, userId),
        ),
      )
      .returning();

    if (!message) {
      return err(
        new Error("Message not found or you don't have permission to edit it"),
      );
    }

    sendAll(ctx.clients.values(), {
      type: "event.message.edited",
      message,
    });

    return ok();
  },

  "action.message.delete": async (ctx, ws, { roomId, id }) => {
    const userId = ws.data.id;
    const isAdmin = ws.data.permissions === 1;

    const [existing] = await db
      .select()
      .from(messages)
      .where(and(eq(messages.id, id), eq(messages.roomId, roomId)))
      .limit(1);

    if (!existing) {
      return err(new Error("Message not found"));
    }

    if (existing.userId !== userId && !isAdmin) {
      return err(new Error("You can only delete your own messages"));
    }

    await db
      .update(messages)
      .set({ deletedAt: new Date() })
      .where(and(eq(messages.id, id), eq(messages.roomId, roomId)));

    sendAll(ctx.clients.values(), {
      type: "event.message.deleted",
      roomId,
      id,
    });

    return ok();
  },

  "action.message.list": async (_ctx, ws, { roomId, fromId, toId }) => {
    if (fromId > toId) {
      return err(new Error("fromId must be less than toId"));
    }

    if (fromId < 0) {
      return err(new Error("fromId must be greater than or equal to 0"));
    }

    if (toId - fromId > 100) {
      return err(new Error("toId must be less than 100"));
    }

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

    if (fromId > room.nextMessageId - 1) {
      return err(
        new Error(
          `Requesting messages that don't exist. Max is ${room.nextMessageId}`,
        ),
      );
    }

    const msg = await db
      .select()
      .from(messages)
      .where(
        and(
          eq(messages.roomId, roomId),
          gte(messages.id, fromId),
          lt(messages.id, toId),
        ),
      )
      .orderBy(messages.id);

    for (const m of msg) {
      if (m.deletedAt) {
        m.text = "";
        m.attachments = null;
        m.replyTo = null;
      }
    }

    send(ws, {
      type: "event.message.list",
      roomId,
      messages: msg,
      fromId,
      toId,
    });

    return ok();
  },

  "action.message.unread": async (_ctx, ws, { roomId, unreadId }) => {
    if (unreadId < 0) {
      return err(new Error("Unread id must be greater than or equal to 0"));
    }

    const userId = ws.data.id;

    const [room] = await db
      .select()
      .from(rooms)
      .where(eq(rooms.id, roomId))
      .limit(1);
    if (!room) {
      return err(new Error("Room not found"));
    }

    if (room.type !== "text") {
      return err(new Error("Room is not a text room"));
    }

    if (unreadId > room.nextMessageId) {
      return err(new Error(`Can't mark the future as unread, bud`));
    }

    const [updated] = await db
      .update(unread)
      .set({ unreadId })
      .where(and(eq(unread.roomId, roomId), eq(unread.userId, userId)))
      .returning();

    if (!updated) {
      await db.insert(unread).values({ roomId, userId, unreadId });
    }

    return ok();
  },
};
