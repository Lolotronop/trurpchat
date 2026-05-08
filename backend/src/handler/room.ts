import { and, desc, eq, isNull, ne, sql } from "drizzle-orm";
import { err, ok } from "neverthrow";
import type { Room, RoomAction } from "trurpchat-shared";
import { patch } from "trurpchat-shared";
import { db, rooms } from "$src/db";
import { send, sendAll } from "$src/send";
import { shouldNormalizeOrder } from "./order";
import { isSessionAdmin } from "./types";
import type { HandlerContext, Handlers } from "./types";

function cheks(ctx: HandlerContext, ws: Parameters<Handlers<RoomAction>["action.room.create"]>[1], room: Partial<Room>) {
  if (!isSessionAdmin(ctx, ws)) {
    return err(new Error("Only admins can create rooms"));
  }

  if (room.name && room.name.length < 3) {
    return err(new Error(`Room name must be at least 3 characters`));
  }
  if (room.name && room.name.length > 50) {
    return err(new Error(`Room name must be at most 50 characters`));
  }

  return ok();
}

function sendRoom(ctx: HandlerContext, room: Room) {
  const event = {
    type: "event.room.updated" as const,
    room,
  };
  patch(ctx.state, event);
  sendAll(ctx.clients.values(), event);
}

function sendRoomList(ctx: HandlerContext, roomList: Room[]) {
  const event = {
    type: "event.room.list" as const,
    rooms: roomList,
  };
  patch(ctx.state, event);
  sendAll(ctx.clients.values(), event);
}

export const roomHandlers: Handlers<RoomAction> = {
  "action.room.create": async (ctx, ws, { room }) => {
    const result = cheks(ctx, ws, room);
    if (result.isErr()) return result;

    const created = await db.transaction(async (tx) => {
      const [roomOrderRow] = await tx
        .select({ order: rooms.order })
        .from(rooms)
        .where(isNull(rooms.deletedAt))
        .orderBy(desc(rooms.order))
        .limit(1);

      const order = roomOrderRow ? roomOrderRow.order + 1 : 0;
      return (await tx.insert(rooms).values([{ ...room, order }]).returning())[0];
    });

    if (!created) return err(new Error(`Failed to crate room ${room.name}`));

    sendRoom(ctx, created);
    return ok();
  },

  "action.room.delete": async (ctx, ws, { id }) => {
    if (!isSessionAdmin(ctx, ws)) {
      return err(new Error("Only admins can delete rooms"));
    }

    const deleted = await db
      .update(rooms)
      .set({ deletedAt: new Date() })
      .where(and(eq(rooms.id, id), isNull(rooms.deletedAt)))
      .returning({ id: rooms.id });

    if (deleted.length === 0) return err(new Error(`Room ${id} not found`));

    for (const voiceUser of ctx.state.voiceUsers.filter((entry) => entry.roomId === id)) {
      const client = ctx.clients.get(voiceUser.userId);
      if (client) {
        send(client, {
          type: "event.voice.left",
          room: id,
          userId: voiceUser.userId,
        });
      }
    }

    const event = { type: "event.room.deleted" as const, roomId: id };
    patch(ctx.state, event);
    sendAll(ctx.clients.values(), event);
    return ok();
  },

  "action.room.update": async (ctx, ws, { room }) => {
    const result = cheks(ctx, ws, room);
    if (result.isErr()) return result;

    const { updatedRoom, normalizedRooms } = await db.transaction(async (tx) => {
      const [updatedRoom] = await tx
        .update(rooms)
        .set(room)
        .where(and(eq(rooms.id, room.id), isNull(rooms.deletedAt)))
        .returning();

      if (!updatedRoom) return { updatedRoom: undefined, normalizedRooms: undefined };
      if (room.order === undefined) return { updatedRoom, normalizedRooms: undefined };

      const [neighbor] = await tx
        .select({ order: rooms.order })
        .from(rooms)
        .where(and(ne(rooms.id, room.id), isNull(rooms.deletedAt)))
        .orderBy(sql`abs(${rooms.order} - ${updatedRoom.order})`)
        .limit(1);

      if (!shouldNormalizeOrder(updatedRoom.order, neighbor)) {
        return { updatedRoom, normalizedRooms: undefined };
      }

      const allRooms = (await tx.select().from(rooms).where(isNull(rooms.deletedAt))).sort(
        (a, b) => a.order - b.order,
      );

      const normalizedRooms: Room[] = [];
      for (let index = 0; index < allRooms.length; index++) {
        const currentRoom = allRooms[index];
        if (!currentRoom) continue;
        const [normalizedRoom] = await tx
          .update(rooms)
          .set({ order: index * 100 })
          .where(eq(rooms.id, currentRoom.id))
          .returning();
        if (normalizedRoom) normalizedRooms.push(normalizedRoom);
      }

      return {
        updatedRoom: normalizedRooms.find((normalizedRoom) => normalizedRoom.id === updatedRoom.id),
        normalizedRooms,
      };
    });

    if (!updatedRoom) return err(new Error(`Room ${room.id} not found`));

    if (normalizedRooms) {
      sendRoomList(ctx, normalizedRooms);
    } else {
      sendRoom(ctx, updatedRoom);
    }

    return ok();
  },
};
