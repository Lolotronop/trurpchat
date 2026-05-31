import { describe, expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import { rooms } from "$src/db";
import { typingHandlers } from "$src/handler/typing";
import { createSeededContext } from "./helpers";

describe("typing handler", () => {
  test("action.typing emits typing event for text rooms", async () => {
    const { ctx, alice } = await createSeededContext();

    const result = await typingHandlers["action.typing"](ctx, alice, { type: "action.typing", roomId: 10 });

    expect(result.isOk()).toBe(true);
    expect(ctx.state.typing).toHaveLength(1);
    expect(ctx.state.typing[0]).toMatchObject({ roomId: 10, userId: 2 });
  });

  test("action.typing rejects rooms the user cannot view", async () => {
    const { ctx, alice } = await createSeededContext();
    const stateRoom = ctx.state.rooms.find((room) => room.id === 10);
    if (!stateRoom) throw new Error("missing room");
    stateRoom.visibilityMode = "private";
    await ctx.db.update(rooms).set({ visibilityMode: "private" }).where(eq(rooms.id, 10));

    const result = await typingHandlers["action.typing"](ctx, alice, {
      type: "action.typing",
      roomId: 10,
    });

    expect(result.isErr()).toBe(true);
    expect(ctx.state.typing).toEqual([]);
    expect(alice.sent.some((message) => message.type === "event.typing")).toBe(false);
  });
});
