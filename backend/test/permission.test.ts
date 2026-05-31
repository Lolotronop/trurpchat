import { describe, expect, test } from "bun:test";
import { Permission } from "trurpchat-shared";
import { permissionHandlers } from "$src/handler/permission";
import { createSeededContext, lastSent } from "./helpers";

describe("permission handlers", () => {
  test("action.permission.list sends current permissions", async () => {
    const { ctx, admin } = await createSeededContext();

    const result = await permissionHandlers["action.permission.list"](ctx, admin, { type: "action.permission.list" });

    expect(result.isOk()).toBe(true);
    expect(lastSent(admin)).toMatchObject({ type: "event.permission.list" });
  });

  test("action.permission.create creates, patches, broadcasts, and refreshes room lists", async () => {
    const { ctx, admin, alice } = await createSeededContext();

    const result = await permissionHandlers["action.permission.create"](ctx, admin, {
      type: "action.permission.create",
      permission: { subjectType: "role", subjectId: 100, roomId: 10, allow: Permission.DELETE_MESSAGES, deny: 0 },
    });

    expect(result.isOk()).toBe(true);
    expect(ctx.state.permissions.some((row) => row.subjectType === "role" && row.subjectId === 100)).toBe(true);
    expect(admin.sent.some((msg) => msg.type === "event.permission.created")).toBe(true);
    expect(alice.sent.some((msg) => msg.type === "event.room.list")).toBe(true);
  });

  test("action.permission.create rejects duplicate permission targets", async () => {
    const { ctx, admin } = await createSeededContext();

    const result = await permissionHandlers["action.permission.create"](ctx, admin, {
      type: "action.permission.create",
      permission: {
        subjectType: "everyone",
        subjectId: null,
        roomId: null,
        allow: Permission.VIEW_ROOM,
        deny: 0,
      },
    });
    const duplicateTargets = ctx.state.permissions.filter(
      (permission) =>
        permission.subjectType === "everyone" &&
        permission.subjectId === null &&
        permission.roomId === null,
    );

    expect(result.isErr()).toBe(true);
    expect(duplicateTargets).toHaveLength(1);
  });

  test("action.permission.update updates an existing permission", async () => {
    const { ctx, admin } = await createSeededContext();

    const result = await permissionHandlers["action.permission.update"](ctx, admin, {
      type: "action.permission.update",
      permission: { id: 1, deny: Permission.SEND_MESSAGES },
    });

    expect(result.isOk()).toBe(true);
    expect(ctx.state.permissions.find((row) => row.id === 1)?.deny).toBe(Permission.SEND_MESSAGES);
  });

  test("action.permission.delete deletes an existing permission", async () => {
    const { ctx, admin } = await createSeededContext();

    const result = await permissionHandlers["action.permission.delete"](ctx, admin, { type: "action.permission.delete", id: 1 });

    expect(result.isOk()).toBe(true);
    expect(ctx.state.permissions.some((row) => row.id === 1)).toBe(false);
  });
});
