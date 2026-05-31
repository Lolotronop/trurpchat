import { eq } from "drizzle-orm";
import { err, ok } from "neverthrow";
import type { PermissionAction, PermissionRow } from "trurpchat-shared";
import { Permission, patch, perm } from "trurpchat-shared";
import { permissions } from "$src/db";
import { send, sendAll } from "$src/send";
import type { Handlers } from "./types";
import { canSession } from "./types";

function validatePermissionTarget(
  ctx: Parameters<Handlers<PermissionAction>["action.permission.list"]>[0],
  permission: Pick<PermissionRow, "subjectType" | "subjectId" | "roomId">,
) {
  if (permission.subjectType === "everyone") {
    if (permission.subjectId !== null)
      return "Everyone permissions must not have a subject id";
  } else if (permission.subjectId === null) {
    return "Role and user permissions must have a subject id";
  } else if (
    permission.subjectType === "role" &&
    !ctx.state.roles.some((role) => role.id === permission.subjectId)
  ) {
    return `Role ${permission.subjectId} not found`;
  } else if (
    permission.subjectType === "user" &&
    !ctx.state.users.some((user) => user.id === permission.subjectId)
  ) {
    return `User ${permission.subjectId} not found`;
  }

  if (
    permission.roomId !== null &&
    !ctx.state.rooms.some((room) => room.id === permission.roomId)
  ) {
    return `Room ${permission.roomId} not found`;
  }
}

function broadcastRoomLists(
  ctx: Parameters<Handlers<PermissionAction>["action.permission.list"]>[0],
) {
  for (const client of ctx.clients.values()) {
    send(client, {
      type: "event.room.list",
      rooms: perm.accessibleRooms(
        ctx.state,
        client.data.userId,
        ctx.state.rooms,
      ),
    });
  }
}

export const permissionHandlers: Handlers<PermissionAction> = {
  "action.permission.list"(ctx, ws) {
    send(ws, {
      type: "event.permission.list",
      permissions: ctx.state.permissions,
    });
    return ok();
  },

  async "action.permission.create"(ctx, ws, msg) {
    if (!canSession(ctx, ws, Permission.MANAGE_PERMISSIONS)) {
      return err(new Error("Missing MANAGE_PERMISSIONS"));
    }
    const targetError = validatePermissionTarget(ctx, msg.permission);
    if (targetError) {
      return err(new Error(targetError));
    }

    const [permission] = await ctx.db
      .insert(permissions)
      .values(msg.permission)
      .returning();
    if (!permission) return err(new Error("Failed to create permission"));

    const event = { type: "event.permission.created" as const, permission };
    patch(ctx.state, event);
    sendAll(ctx.clients.values(), event);
    broadcastRoomLists(ctx);
    return ok();
  },

  async "action.permission.update"(ctx, ws, msg) {
    if (!canSession(ctx, ws, Permission.MANAGE_PERMISSIONS)) {
      return err(new Error("Missing MANAGE_PERMISSIONS"));
    }

    const existing = ctx.state.permissions.find(
      (row) => row.id === msg.permission.id,
    );
    if (!existing) return err(new Error("Permission not found"));

    const next = { ...existing, ...msg.permission };
    const targetError = validatePermissionTarget(ctx, next);
    if (targetError) {
      return err(new Error(targetError));
    }

    const [permission] = await ctx.db
      .update(permissions)
      .set(msg.permission)
      .where(eq(permissions.id, msg.permission.id))
      .returning();
    if (!permission) return err(new Error("Failed to update permission"));

    const event = { type: "event.permission.updated" as const, permission };
    patch(ctx.state, event);
    sendAll(ctx.clients.values(), event);
    broadcastRoomLists(ctx);
    return ok();
  },

  async "action.permission.delete"(ctx, ws, msg) {
    if (!canSession(ctx, ws, Permission.MANAGE_PERMISSIONS)) {
      return err(new Error("Missing MANAGE_PERMISSIONS"));
    }

    const [permission] = await ctx.db
      .delete(permissions)
      .where(eq(permissions.id, msg.id))
      .returning();
    if (!permission) return err(new Error("Permission not found"));

    const event = { type: "event.permission.deleted" as const, id: msg.id };
    patch(ctx.state, event);
    sendAll(ctx.clients.values(), event);
    broadcastRoomLists(ctx);
    return ok();
  },
};
