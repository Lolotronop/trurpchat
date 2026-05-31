import { describe, expect, test } from "bun:test";
import { voiceHandlers } from "$src/handler/voice";
import { createSeededContext, lastSent } from "./helpers";

describe("voice handlers", () => {
  test("action.voice.join joins a voice room", async () => {
    const { ctx, alice } = await createSeededContext();

    const result = await voiceHandlers["action.voice.join"](ctx, alice, { type: "action.voice.join", room: 20 });

    expect(result.isOk()).toBe(true);
    expect(ctx.state.voiceUsers).toContainEqual({ roomId: 20, userId: 2 });
  });

  test("action.voice.watch and action.voice.unwatch update watchedBy", async () => {
    const { ctx, admin, alice } = await createSeededContext();
    ctx.state.voiceUsers.push({ roomId: 20, userId: 1 }, { roomId: 20, userId: 2 });

    const watch = await voiceHandlers["action.voice.watch"](ctx, alice, { type: "action.voice.watch", userId: 1 });
    const unwatch = await voiceHandlers["action.voice.unwatch"](ctx, alice, { type: "action.voice.unwatch", userId: 1 });

    expect(watch.isOk()).toBe(true);
    expect(unwatch.isOk()).toBe(true);
    expect(ctx.state.users.find((user) => user.id === 1 && user.online)?.watchedBy).toEqual([]);
    expect(admin.sent.some((msg) => msg.type === "event.user.state")).toBe(true);
  });

  test("action.voice.pause sends pause event to a streaming target", async () => {
    const { ctx, admin, alice } = await createSeededContext();
    ctx.state.voiceUsers.push({ roomId: 20, userId: 2 });
    const target = ctx.state.users.find((user) => user.id === 2 && user.online);
    if (!target) throw new Error("missing target");
    target.streaming = true;

    const result = await voiceHandlers["action.voice.pause"](ctx, admin, { type: "action.voice.pause", userId: 2 });

    expect(result.isOk()).toBe(true);
    expect(lastSent(alice)).toMatchObject({ type: "event.voice.pause", fromUserId: 1 });
  });

  test("action.voice.leave leaves a voice room and clears streaming/watch state", async () => {
    const { ctx, alice } = await createSeededContext();
    ctx.state.voiceUsers.push({ roomId: 20, userId: 2 });
    const target = ctx.state.users.find((user) => user.id === 2 && user.online);
    if (!target) throw new Error("missing target");
    target.streaming = true;
    target.watchedBy = [1];

    const result = await voiceHandlers["action.voice.leave"](ctx, alice, { type: "action.voice.leave", room: 20 });

    expect(result.isOk()).toBe(true);
    expect(ctx.state.voiceUsers).toEqual([]);
    expect(target.streaming).toBe(false);
    expect(target.watchedBy).toEqual([]);
  });
});
