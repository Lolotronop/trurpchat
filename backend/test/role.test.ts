import { describe, expect, test } from "bun:test";
import { userRoles } from "$src/db";
import { roleHandlers } from "$src/handler/role";
import { createSeededContext, lastSent } from "./helpers";

describe("role handlers", () => {
  test("action.role.list sends roles and assignments", async () => {
    const { ctx, admin } = await createSeededContext();
    await ctx.db.insert(userRoles).values({ userId: 2, roleId: 100 });

    const result = await roleHandlers["action.role.list"](ctx, admin, { type: "action.role.list" });

    expect(result.isOk()).toBe(true);
    expect(lastSent(admin)).toMatchObject({ type: "event.role.list" });
  });

  test("action.role.create creates a role", async () => {
    const { ctx, admin } = await createSeededContext();

    const result = await roleHandlers["action.role.create"](ctx, admin, {
      type: "action.role.create",
      role: { name: "created-role", color: 0x123456 },
    });

    expect(result.isOk()).toBe(true);
    expect(ctx.state.roles.some((role) => role.name === "created-role")).toBe(true);
  });

  test("action.role.update updates a role", async () => {
    const { ctx, admin } = await createSeededContext();

    const result = await roleHandlers["action.role.update"](ctx, admin, {
      type: "action.role.update",
      role: { id: 100, name: "updated-role" },
    });

    expect(result.isOk()).toBe(true);
    expect(ctx.state.roles.find((role) => role.id === 100)?.name).toBe("updated-role");
  });

  test("action.role.assign and action.role.unassign update assignments", async () => {
    const { ctx, admin } = await createSeededContext();

    const assign = await roleHandlers["action.role.assign"](ctx, admin, {
      type: "action.role.assign",
      userId: 2,
      roleId: 100,
    });
    const unassign = await roleHandlers["action.role.unassign"](ctx, admin, {
      type: "action.role.unassign",
      userId: 2,
      roleId: 100,
    });

    expect(assign.isOk()).toBe(true);
    expect(unassign.isOk()).toBe(true);
    expect(ctx.state.userRoles).toEqual([]);
  });

  test("action.role.delete deletes a role", async () => {
    const { ctx, admin } = await createSeededContext();

    const result = await roleHandlers["action.role.delete"](ctx, admin, { type: "action.role.delete", id: 100 });

    expect(result.isOk()).toBe(true);
    expect(ctx.state.roles.some((role) => role.id === 100)).toBe(false);
  });
});
