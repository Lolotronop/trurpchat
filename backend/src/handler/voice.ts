import { err, ok } from "neverthrow";
import type { VoiceAction } from "$src/types";
import { send } from "$src/send";
import type { Handlers } from "./types";

export const voiceHandlers: Handlers<VoiceAction> = {
  "action.voice.join": (ctx, ws, msg) => {
    const room = ctx.hotel.find(msg.room);
    if (!room) {
      return err(new Error(`Room ${msg.room} not found`));
    }
    room.add(ws);
    return ok();
  },

  "action.voice.leave": (ctx, ws, msg) => {
    const room = ctx.hotel.find(msg.room);
    if (!room) {
      return err(new Error(`Room ${msg.room} not found`));
    }
    room.remove(ws);
    ws.data.streaming = false;
    ws.data.watching = null;
    return ok();
  },

  "action.voice.mute": (_, ws, msg) => {
    ws.data.muted = msg.muted;
    return ok();
  },

  "action.voice.stream": (_, ws, msg) => {
    ws.data.streaming = msg.streaming;
    return ok();
  },

  "action.voice.deafen": (_, ws, msg) => {
    ws.data.deafened = msg.deafened;
    return ok();
  },

  "action.voice.watch": (_, ws, msg) => {
    ws.data.watching = msg.watching;
    return ok();
  },

  "action.voice.pause": (ctx, ws, msg) => {
    if (ws.data.watching === null) {
      return ok();
    }
    const to = ctx.clients.get(msg.userId);
    if (!to) {
      return err(new Error(`Client ${ws.data.watching} not found`));
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
