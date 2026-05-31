import { describe, expect, test } from "bun:test";
import { roomHandlers } from "$src/handler/room";
import { createSeededContext } from "./helpers";

describe("room handlers", () => {
  test("action.room.create creates a room", async () => {
    const { ctx, admin } = await createSeededContext();

    const result = await roomHandlers["action.room.create"](ctx, admin, {
      type: "action.room.create",
      room: { name: "new-room", type: "text", visibilityMode: "inherit" },
    });

    expect(result.isOk()).toBe(true);
    expect(ctx.state.rooms.some((room) => room.name === "new-room")).toBe(true);
  });

  test("action.room.update updates a room", async () => {
    const { ctx, admin } = await createSeededContext();

    const result = await roomHandlers["action.room.update"](ctx, admin, {
      type: "action.room.update",
      room: { id: 10, name: "renamed-room" },
    });

    expect(result.isOk()).toBe(true);
    expect(ctx.state.rooms.find((room) => room.id === 10)?.name).toBe("renamed-room");
  });

  test("action.room.delete deletes a room and emits voice leaves for users in it", async () => {
    const { ctx, admin, alice } = await createSeededContext();
    ctx.state.voiceUsers.push({ roomId: 20, userId: 2 });

    const result = await roomHandlers["action.room.delete"](ctx, admin, { type: "action.room.delete", id: 20 });

    expect(result.isOk()).toBe(true);
    expect(ctx.state.rooms.some((room) => room.id === 20)).toBe(false);
    expect(alice.sent.some((msg) => msg.type === "event.voice.left" && msg.userId === 2)).toBe(true);
  });
});
