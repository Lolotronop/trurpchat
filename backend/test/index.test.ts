import { describe, expect, test } from "bun:test";
import { handleMessage } from "$src/handler";
import { createSeededContext, lastSent } from "./helpers";

describe("handler dispatcher", () => {
  test("rejects server events from clients", async () => {
    const { ctx, admin } = await createSeededContext();

    const result = await handleMessage(ctx, admin, { type: "event.user.online", userId: 1 });

    expect(result.isErr()).toBe(true);
  });

  test("dispatches registered action handlers", async () => {
    const { ctx, admin } = await createSeededContext();

    const result = await handleMessage(ctx, admin, { type: "action.permission.list" });

    expect(result.isOk()).toBe(true);
    expect(lastSent(admin).type).toBe("event.permission.list");
  });
});
