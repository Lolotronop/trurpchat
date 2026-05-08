import { err, ok } from "neverthrow";
import type { ConnectedUser, VoiceAction } from "trurpchat-shared";
import { Permission, connectedUser, patch, user } from "trurpchat-shared";
import { send, sendAll } from "$src/send";
import { canSession } from "./types";
import type { Handlers } from "./types";

function sendUserState(ctx: Parameters<Handlers<VoiceAction>["action.voice.join"]>[0], target: ConnectedUser) {
  const event = {
    type: "event.user.state" as const,
    user: target,
  };
  patch(ctx.state, event);
  sendAll(ctx.clients.values(), event);
}

function removeWatcherFromTarget(
  targetId: number,
  watcherId: number,
  ctx: Parameters<Handlers<VoiceAction>["action.voice.join"]>[0],
) {
  const target = connectedUser(ctx.state, targetId);
  if (!target) return false;

  const nextWatchedBy = target.watchedBy.filter((id) => id !== watcherId);
  if (nextWatchedBy.length === target.watchedBy.length) return false;

  target.watchedBy = nextWatchedBy;
  sendUserState(ctx, target);
  return true;
}

export function removeWatcherFromAllUsers(
  ctx: Parameters<Handlers<VoiceAction>["action.voice.join"]>[0],
  watcherId: number,
) {
  let updated = false;
  for (const target of ctx.state.users) {
    if (!target.online || !target.watchedBy.includes(watcherId)) continue;

    target.watchedBy = target.watchedBy.filter((id) => id !== watcherId);
    sendUserState(ctx, target);
    updated = true;
  }

  return updated;
}

export const voiceHandlers: Handlers<VoiceAction> = {
  "action.voice.join": (ctx, ws, msg) => {
    const room = ctx.state.rooms.find((room) => room.id === msg.room);
    if (!room) return err(new Error(`Room ${msg.room} not found`));
    if (room.type !== "voice") return err(new Error(`Room ${msg.room} is not a voice room`));
    if (!canSession(ctx, ws, Permission.VIEW_ROOM, msg.room)) {
      return err(new Error("Missing VIEW_ROOM"));
    }

    const event = {
      type: "event.voice.joined" as const,
      room: msg.room,
      userId: ws.data.userId,
    };
    patch(ctx.state, event);
    sendAll(ctx.clients.values(), event);
    return ok();
  },

  "action.voice.leave": (ctx, ws, msg) => {
    const room = ctx.state.rooms.find((room) => room.id === msg.room);
    if (!room) return err(new Error(`Room ${msg.room} not found`));

    removeWatcherFromAllUsers(ctx, ws.data.userId);

    const me = connectedUser(ctx.state, ws.data.userId);
    if (me) {
      if (me.watchedBy.length > 0) {
        me.watchedBy = [];
        sendUserState(ctx, me);
      }
      if (me.streaming) {
        me.streaming = false;
        sendUserState(ctx, me);
      }
    }

    const event = {
      type: "event.voice.left" as const,
      room: msg.room,
      userId: ws.data.userId,
    };
    patch(ctx.state, event);
    sendAll(ctx.clients.values(), event);
    return ok();
  },

  "action.voice.watch": (ctx, ws, msg) => {
    const target = connectedUser(ctx.state, msg.userId);
    if (!target) return err(new Error(`Client ${msg.userId} not found`));

    const voiceRoom = ctx.state.voiceUsers.find((entry) => entry.userId === msg.userId);
    if (!voiceRoom || !canSession(ctx, ws, Permission.VIEW_ROOM, voiceRoom.roomId)) {
      return err(new Error("Missing VIEW_ROOM"));
    }

    if (target.watchedBy.includes(ws.data.userId)) return ok();

    target.watchedBy.push(ws.data.userId);
    sendUserState(ctx, target);
    return ok();
  },

  "action.voice.unwatch": (ctx, ws, msg) => {
    removeWatcherFromTarget(msg.userId, ws.data.userId, ctx);
    return ok();
  },

  "action.voice.pause": (ctx, ws, msg) => {
    const to = ctx.clients.get(msg.userId);
    const target = user(ctx.state, msg.userId);
    if (!to || !target?.online) return err(new Error(`Client ${msg.userId} not found`));
    const voiceRoom = ctx.state.voiceUsers.find((entry) => entry.userId === msg.userId);
    if (!voiceRoom || !canSession(ctx, ws, Permission.PAUSE_STREAMS, voiceRoom.roomId)) {
      return err(new Error("Missing PAUSE_STREAMS"));
    }
    if (!target.streaming) return ok();

    send(to, {
      type: "event.voice.pause",
      fromUserId: ws.data.userId,
    });
    return ok();
  },
};
