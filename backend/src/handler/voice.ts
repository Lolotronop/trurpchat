import { err, ok } from "neverthrow";
import { send, sendAll } from "$src/send";
import type { VoiceAction } from "$src/types";
import type { Handlers } from "./types";

function removeWatcherFromTarget(
  targetId: number,
  watcherId: number,
  ctx: Parameters<Handlers<VoiceAction>["action.voice.join"]>[0],
) {
  const target = ctx.clients.get(targetId);
  if (!target) {
    return false;
  }

  const nextWatchedBy = target.data.watchedBy.filter((id) => id !== watcherId);
  if (nextWatchedBy.length === target.data.watchedBy.length) {
    return false;
  }

  target.data.watchedBy = nextWatchedBy;
  sendAll(ctx.clients.values(), {
    type: "event.user.state",
    user: target.data,
  });
  return true;
}

export function removeWatcherFromAllUsers(
  ctx: Parameters<Handlers<VoiceAction>["action.voice.join"]>[0],
  watcherId: number,
) {
  let updated = false;
  for (const target of ctx.clients.values()) {
    if (!target.data.watchedBy.includes(watcherId)) {
      continue;
    }

    target.data.watchedBy = target.data.watchedBy.filter(
      (id) => id !== watcherId,
    );
    sendAll(ctx.clients.values(), {
      type: "event.user.state",
      user: target.data,
    });
    updated = true;
  }

  return updated;
}

export const voiceHandlers: Handlers<VoiceAction> = {
  "action.voice.join": (ctx, ws, msg) => {
    const room = ctx.hotel.find(msg.room);
    if (!room) {
      return err(new Error(`Room ${msg.room} not found`));
    }
    room.add(ws);
    sendAll(ctx.clients.values(), {
      type: "event.voice.joined",
      room: msg.room,
      userId: ws.data.id,
    });
    return ok();
  },

  "action.voice.leave": (ctx, ws, msg) => {
    const room = ctx.hotel.find(msg.room);
    if (!room) {
      return err(new Error(`Room ${msg.room} not found`));
    }
    room.remove(ws);
    removeWatcherFromAllUsers(ctx, ws.data.id);
    if (ws.data.watchedBy.length > 0) {
      ws.data.watchedBy = [];
      sendAll(ctx.clients.values(), {
        type: "event.user.state",
        user: ws.data,
      });
    }
    if (ws.data.streaming) {
      ws.data.streaming = false;
      sendAll(ctx.clients.values(), {
        type: "event.user.state",
        user: ws.data,
      });
    }
    sendAll(ctx.clients.values(), {
      type: "event.voice.left",
      room: msg.room,
      userId: ws.data.id,
    });
    return ok();
  },

  "action.voice.watch": (ctx, ws, msg) => {
    const target = ctx.clients.get(msg.userId);
    if (!target) {
      return err(new Error(`Client ${msg.userId} not found`));
    }

    if (target.data.watchedBy.includes(ws.data.id)) {
      return ok();
    }

    target.data.watchedBy = [...target.data.watchedBy, ws.data.id];
    sendAll(ctx.clients.values(), {
      type: "event.user.state",
      user: target.data,
    });
    return ok();
  },

  "action.voice.unwatch": (ctx, ws, msg) => {
    removeWatcherFromTarget(msg.userId, ws.data.id, ctx);
    return ok();
  },

  "action.voice.pause": (ctx, ws, msg) => {
    const to = ctx.clients.get(msg.userId);
    if (!to) {
      return err(new Error(`Client ${msg.userId} not found`));
    }
    if (!to.data.streaming) {
      return ok();
    }

    send(to, {
      type: "event.voice.pause",
      fromUserId: ws.data.id,
    });
    return ok();
  },
};
