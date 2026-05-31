import { describe, expect, test } from "bun:test";
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
});
