import { err, ok } from "neverthrow";
import { eq } from "drizzle-orm";
import type { Room, RoomAction, RoomData } from "$src/types";
import { db, rooms } from "$src/db";
import { VoiceChatInstance, type WsClient } from "$src/voice";
import { send, sendAll } from "$src/send";
import type { HandlerContext, Handlers } from "./types";

function cheks(ws: WsClient, room: Omit<RoomData, "id">) {
  if (ws.data.permissions !== 1) {
    return err(new Error("Only admins can create rooms"));
  }

  if (room.name.length < 3) {
    return err(new Error(`Room name must be at least 3 characters`));
  }
  if (room.name.length > 50) {
    return err(new Error(`Room name must be at most 50 characters`));
  }

  return ok();
}

function sendRooms(ctx: HandlerContext) {
  sendAll(ctx.clients.values(), {
    type: "event.room.list",
    rooms: ctx.hotel.toJson(),
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

    const created = (await db.insert(rooms).values([room]).returning())[0];

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
      voice.data = room;
      sendRoom(ctx, voice.toJson());
    } else {
      // TODO: handle text rooms properly
      sendRoom(ctx, room as Room);
    }

    return ok();
  },
};
