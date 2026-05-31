import { describe, expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import { keys } from "$src/db";
import { keyHandlers } from "$src/handler/key";
import { createSeededContext, lastSent } from "./helpers";

describe("key handlers", () => {
  test("action.key.list sends visible keys", async () => {
    const { ctx, admin } = await createSeededContext();

    const result = await keyHandlers["action.key.list"](ctx, admin, { type: "action.key.list" });

    expect(result.isOk()).toBe(true);
    expect(lastSent(admin)).toMatchObject({ type: "event.key.list" });
  });

  test("action.key.add creates a key", async () => {
    const { ctx, admin } = await createSeededContext();

    const result = await keyHandlers["action.key.add"](ctx, admin, { type: "action.key.add", userId: 2 });
    const dbKeys = await ctx.db.select().from(keys).where(eq(keys.userId, 2));

    expect(result.isOk()).toBe(true);
    expect(dbKeys.length).toBe(2);
  });

  test("action.key.add notifies the affected user with only their own keys", async () => {
    const { ctx, admin, alice } = await createSeededContext();

    const result = await keyHandlers["action.key.add"](ctx, admin, {
      type: "action.key.add",
      userId: 2,
    });
    const event = lastSent<{ type: "event.key.list"; keys: Array<{ userId: number }> }>(alice);

    expect(result.isOk()).toBe(true);
    expect(event.keys.map((key) => key.userId)).toEqual([2, 2]);
  });

  test("action.key.remove removes a key", async () => {
    const { ctx, admin } = await createSeededContext();

    const result = await keyHandlers["action.key.remove"](ctx, admin, { type: "action.key.remove", keyId: 2 });
    const dbKeys = await ctx.db.select().from(keys).where(eq(keys.id, 2));

    expect(result.isOk()).toBe(true);
    expect(dbKeys).toEqual([]);
  });
});
