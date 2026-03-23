import { err, ok } from "neverthrow";
import { desc, eq } from "drizzle-orm";
import type { Room, RoomAction, RoomData } from "$src/types";
import { db, rooms } from "$src/db";
import { VoiceChatInstance, type WsClient } from "$src/voice";
import { send, sendAll } from "$src/send";
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

async function sendRooms(ctx: HandlerContext) {
  // TODO: make this a separate function?
  const voice = ctx.hotel.toJson();
  const text = (await db
    .select()
    .from(rooms)
    .where(eq(rooms.type, "text"))) as Extract<Room, { type: "text" }>[];
  const r = [...voice, ...text];
  sendAll(ctx.clients.values(), {
    type: "event.room.list",
    rooms: r,
  });
}

function sendRoom(ctx: HandlerContext, room: Room) {
  sendAll(ctx.clients.values(), {
    type: "event.room.update",
    room: room,
  });
}

export const roomHandlers: Handlers<RoomAction> = {
  "action.room.create": async (ctx, ws, { room }) => {
    const result = cheks(ws, room);
    if (result.isErr()) {
      return result;
    }

    const [roomOrderRow] = await db
      .select({ order: rooms.order })
      .from(rooms)
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

    const created = (await db.insert(rooms).values([row]).returning())[0];

    if (!created) {
      return err(new Error(`Failed to crate room ${room.name}`));
    }

    if (created.type === "voice") {
      const instance = new VoiceChatInstance(created);
      ctx.hotel.rooms.push(instance);
      sendRoom(ctx, instance.toJson());
    } else {
      // TODO: handle text rooms properly
      sendRoom(ctx, created as Room);
    }

    return ok();
  },

  "action.room.delete": async (ctx, ws, { id }) => {
    if (ws.data.permissions !== 1) {
      return err(new Error("Only admins can delete rooms"));
    }

    await db.delete(rooms).where(eq(rooms.id, id));

    const room = ctx.hotel.find(id);
    if (room) {
      for (const client of room.clients.values()) {
        send(client, {
          type: "event.voice.left",
          room: room.data.id,
          user: client.data,
        });
      }
      ctx.hotel.rooms.splice(ctx.hotel.rooms.indexOf(room), 1);
    }
    // TODO: don't resent the entire list on delete
    sendRooms(ctx);
    return ok();
  },

  "action.room.update": async (ctx, ws, { room }) => {
    const result = cheks(ws, room);
    if (result.isErr()) {
      return result;
    }

    await db.update(rooms).set(room).where(eq(rooms.id, room.id));

    const voice = ctx.hotel.find(room.id);
    if (voice) {
      voice.data = { ...voice.data, ...room };
      sendRoom(ctx, voice.toJson());
    } else {
      // TODO: handle text rooms properly
      sendRoom(ctx, room as Room);
    }

    return ok();
  },
};
