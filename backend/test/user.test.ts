import { describe, expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import { users } from "$src/db";
import { userHandlers } from "$src/handler/user";
import { createSeededContext } from "./helpers";

describe("user handlers", () => {
  test("action.user.create creates a user and key", async () => {
    const { ctx, admin } = await createSeededContext();

    const result = await userHandlers["action.user.create"](ctx, admin, { type: "action.user.create", name: "new-user" });
    const [created] = await ctx.db.select().from(users).where(eq(users.name, "new-user"));

    expect(result.isOk()).toBe(true);
    expect(created).toBeDefined();
    expect(ctx.state.users.some((user) => user.name === "new-user")).toBe(true);
  });

  test("action.user.state updates connected user state", async () => {
    const { ctx, alice } = await createSeededContext();

    const result = await userHandlers["action.user.state"](ctx, alice, { type: "action.user.state", muted: true });

    expect(result.isOk()).toBe(true);
    expect(ctx.state.users.find((user) => user.id === 2 && user.online)?.muted).toBe(true);
  });

  test("action.user.update updates a user", async () => {
    const { ctx, alice } = await createSeededContext();

    const result = await userHandlers["action.user.update"](ctx, alice, {
      type: "action.user.update",
      id: 2,
      displayName: "Alice Display",
    });

    expect(result.isOk()).toBe(true);
    expect(ctx.state.users.find((user) => user.id === 2)?.displayName).toBe("Alice Display");
  });

  test("action.user.delete soft-deletes a user and closes active client", async () => {
    const { ctx, admin, alice } = await createSeededContext();

    const result = await userHandlers["action.user.delete"](ctx, admin, { type: "action.user.delete", id: 2 });
    const [deleted] = await ctx.db.select().from(users).where(eq(users.id, 2));

    expect(result.isOk()).toBe(true);
    expect(alice.closed).toBe(true);
    expect(deleted?.deletedAt).toBeInstanceOf(Date);
    expect(ctx.state.users.some((user) => user.id === 2)).toBe(false);
  });
});
