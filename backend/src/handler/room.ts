import { and, desc, eq, isNull, ne, sql } from "drizzle-orm";
import { err, ok } from "neverthrow";
import { db, rooms } from "$src/db";
import { send, sendAll } from "$src/send";
import type { Room, RoomAction, RoomData } from "$src/types";
import { VoiceChatInstance, type WsClient } from "$src/voice";
import { shouldNormalizeOrder } from "./order";
import type { HandlerContext, Handlers } from "./types";

function cheks(ws: WsClient, room: Partial<RoomData>) {
  if (ws.data.permissions !== 1) {
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
  sendAll(ctx.clients.values(), {
    type: "event.room.updated",
    room: room,
  });
}

function sendRoomList(ctx: HandlerContext, roomList: Room[]) {
  sendAll(ctx.clients.values(), {
    type: "event.room.list",
    rooms: roomList,
  });
}

export const roomHandlers: Handlers<RoomAction> = {
  "action.room.create": async (ctx, ws, { room }) => {
    const result = cheks(ws, room);
    if (result.isErr()) {
      return result;
    }

    const created = await db.transaction(async (tx) => {
      const [roomOrderRow] = await tx
        .select({ order: rooms.order })
        .from(rooms)
        .where(isNull(rooms.deletedAt))
        .orderBy(desc(rooms.order))
        .limit(1);

      let order = 0;
      if (roomOrderRow) {
        order = roomOrderRow.order + 1;
      }

      const row = {
        ...room,
        order,
      };

      const created = (await tx.insert(rooms).values([row]).returning())[0];
      return created;
    });

    if (!created) {
      return err(new Error(`Failed to crate room ${room.name}`));
    }

    if (created.type === "voice") {
      const instance = new VoiceChatInstance(created);
      ctx.hotel.rooms.push(instance);
    }

    sendRoom(ctx, created as Room);

    return ok();
  },

  "action.room.delete": async (ctx, ws, { id }) => {
    if (ws.data.permissions !== 1) {
      return err(new Error("Only admins can delete rooms"));
    }

    const deleted = await db
      .update(rooms)
      .set({ deletedAt: new Date() })
      .where(and(eq(rooms.id, id), isNull(rooms.deletedAt)))
      .returning({ id: rooms.id });

    if (deleted.length === 0) {
      return err(new Error(`Room ${id} not found`));
    }

    const room = ctx.hotel.find(id);
    if (room) {
      for (const client of room.clients.values()) {
        send(client, {
          type: "event.voice.left",
          room: room.data.id,
          userId: client.data.id,
        });
      }
      ctx.hotel.rooms.splice(ctx.hotel.rooms.indexOf(room), 1);
    }

    sendAll(ctx.clients.values(), {
      type: "event.room.deleted",
      roomId: id,
    });
    return ok();
  },

  "action.room.update": async (ctx, ws, { room }) => {
    const result = cheks(ws, room);
    if (result.isErr()) {
      return result;
    }

    const { updatedRoom, normalizedRooms } = await db.transaction(async (tx) => {
      const [updatedRoom] = await tx
        .update(rooms)
        .set(room)
        .where(and(eq(rooms.id, room.id), isNull(rooms.deletedAt)))
        .returning();

      if (!updatedRoom) {
        return { updatedRoom: undefined, normalizedRooms: undefined };
      }

      if (room.order === undefined) {
        return { updatedRoom, normalizedRooms: undefined };
      }

      const [neighbor] = await tx
        .select({ order: rooms.order })
        .from(rooms)
        .where(and(ne(rooms.id, room.id), isNull(rooms.deletedAt)))
        .orderBy(sql`abs(${rooms.order} - ${updatedRoom.order})`)
        .limit(1);

      if (!shouldNormalizeOrder(updatedRoom.order, neighbor)) {
        return { updatedRoom, normalizedRooms: undefined };
      }

      const allRooms = (
        await tx.select().from(rooms).where(isNull(rooms.deletedAt))
      ).sort((a, b) => a.order - b.order);

      const normalizedRooms: RoomData[] = [];
      for (let index = 0; index < allRooms.length; index++) {
        const currentRoom = allRooms[index];
        if (!currentRoom) continue;

        const order = index * 100;
        const [normalizedRoom] = await tx
          .update(rooms)
          .set({ order })
          .where(eq(rooms.id, currentRoom.id))
          .returning();

        if (normalizedRoom) {
          normalizedRooms.push(normalizedRoom);
        }
      }

      return {
        updatedRoom: normalizedRooms.find(
          (normalizedRoom) => normalizedRoom.id === updatedRoom.id,
        ),
        normalizedRooms,
      };
    });

    if (!updatedRoom) {
      return err(new Error(`Room ${room.id} not found`));
    }

    if (normalizedRooms) {
      const roomList = normalizedRooms.map((normalizedRoom) => {
        const voice = ctx.hotel.find(normalizedRoom.id);
        if (voice) {
          voice.data = { ...voice.data, ...normalizedRoom };
          return voice.toJson();
        }

        return normalizedRoom as Room;
      });

      sendRoomList(ctx, roomList);
    } else {
      const voice = ctx.hotel.find(updatedRoom.id);
      if (voice) {
        voice.data = { ...voice.data, ...updatedRoom };
      }

      sendRoom(ctx, updatedRoom as Room);
    }

    return ok();
  },
};
