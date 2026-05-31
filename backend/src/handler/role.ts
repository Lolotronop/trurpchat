import { and, eq, isNull, ne, sql } from "drizzle-orm";
import { err, ok } from "neverthrow";
import type { Role, RoleAction, ServerEvent, SharedState, UserRole } from "trurpchat-shared";
import { Permission, patch } from "trurpchat-shared";
import { roles, userRoles } from "$src/db";
import { send, sendAll } from "$src/send";
import { shouldNormalizeOrder } from "./order";
import type { Handlers } from "./types";
import { canSession } from "./types";

function sendRoleEvent(
  ctx: Parameters<Handlers<RoleAction>["action.role.create"]>[0],
  event: ServerEvent,
) {
  patch(ctx.state, event);
  sendAll(ctx.clients.values(), event);
}

function validateRoleInput(role: Partial<Role>) {
  if (role.color !== undefined && (role.color < 0 || role.color > 0xffffff)) {
    return err(new Error("Role color must be between 0x000000 and 0xFFFFFF"));
  }

  return ok();
}

export function getAllRoles(state: SharedState): Role[] {
  return state.roles;
}

export function getAllAssignments(state: SharedState): UserRole[] {
  return state.userRoles.filter(
    (assignment) =>
      state.users.some((user) => user.id === assignment.userId) &&
      state.roles.some((role) => role.id === assignment.roleId),
  );
}

export function sendRoleList(
  state: SharedState,
  client: Parameters<typeof send>[0],
) {
  send(client, {
    type: "event.role.list",
    roles: getAllRoles(state),
    assignments: getAllAssignments(state),
  });
}

export const roleHandlers: Handlers<RoleAction> = {
  "action.role.list": async (ctx, ws, _msg) => {
    sendRoleList(ctx.state, ws);
    return ok();
  },

  "action.role.create": async (ctx, ws, msg) => {
    if (!canSession(ctx, ws, Permission.MANAGE_ROLES)) {
      return err(
        new Error(`User ${ws.data.userId} is not admin, tryed to create role`),
      );
    }

    const validation = validateRoleInput(msg.role);
    if (validation.isErr()) {
      return validation;
    }

    const order = Math.max(-1, ...ctx.state.roles.map((role) => role.order)) + 1;
    const [created] = await ctx.db
      .insert(roles)
      .values({
        ...msg.role,
        section: msg.role.section ?? false,
        order,
      })
      .returning({
        id: roles.id,
        name: roles.name,
        color: roles.color,
        section: roles.section,
        order: roles.order,
      });

    if (!created) {
      return err(new Error(`Failed to create role ${msg.role.name}`));
    }

    sendRoleEvent(ctx, {
      type: "event.role.created",
      role: created,
    });

    return ok();
  },

  "action.role.update": async (ctx, ws, msg) => {
    if (!canSession(ctx, ws, Permission.MANAGE_ROLES)) {
      return err(
        new Error(`User ${ws.data.userId} is not admin, tryed to update role`),
      );
    }

    const validation = validateRoleInput(msg.role);
    if (validation.isErr()) {
      return validation;
    }

    const { id, ...rest } = msg.role;
    const { updated, normalizedRoles } = await ctx.db.transaction(
      async (tx) => {
        const [updatedRole] = await tx
          .update(roles)
          .set(rest)
          .where(and(eq(roles.id, id), isNull(roles.deletedAt)))
          .returning({
            id: roles.id,
            name: roles.name,
            color: roles.color,
            section: roles.section,
            order: roles.order,
          });

        if (!updatedRole) {
          return { updated: undefined, normalizedRoles: undefined };
        }

        if (rest.order === undefined) {
          return { updated: updatedRole, normalizedRoles: undefined };
        }

        const [neighbor] = await tx
          .select({ order: roles.order })
          .from(roles)
          .where(and(ne(roles.id, id), isNull(roles.deletedAt)))
          .orderBy(sql`abs(${roles.order} - ${updatedRole.order})`)
          .limit(1);

        if (!shouldNormalizeOrder(updatedRole.order, neighbor)) {
          return { updated: updatedRole, normalizedRoles: undefined };
        }

        const allRoles = (
          await tx.select().from(roles).where(isNull(roles.deletedAt))
        ).sort((a, b) => a.order - b.order);

        const normalizedRoles: Role[] = [];
        for (let index = 0; index < allRoles.length; index++) {
          const role = allRoles[index];
          if (!role) continue;

          const order = index * 100;
          const [normalizedRole] = await tx
            .update(roles)
            .set({ order })
            .where(eq(roles.id, role.id))
            .returning({
              id: roles.id,
              name: roles.name,
              color: roles.color,
              section: roles.section,
              order: roles.order,
            });

          if (normalizedRole) {
            normalizedRoles.push(normalizedRole);
          }
        }

        return {
          updated: normalizedRoles.find((role) => role.id === updatedRole.id),
          normalizedRoles,
        };
      },
    );

    if (!updated) {
      return err(new Error(`Role ${id} not found`));
    }

    if (normalizedRoles) {
      sendRoleEvent(ctx, {
        type: "event.role.list",
        roles: normalizedRoles,
        assignments: getAllAssignments(ctx.state),
      });
    } else {
      sendRoleEvent(ctx, {
        type: "event.role.updated",
        role: updated,
      });
    }

    return ok();
  },

  "action.role.delete": async (ctx, ws, msg) => {
    if (!canSession(ctx, ws, Permission.MANAGE_ROLES)) {
      return err(
        new Error(`User ${ws.data.userId} is not admin, tryed to delete role`),
      );
    }

    const { deletedAssignments, deleted } = await ctx.db.transaction(
      async (tx) => {
        const deletedAssignments = await tx
          .delete(userRoles)
          .where(eq(userRoles.roleId, msg.id))
          .returning({
            userId: userRoles.userId,
            roleId: userRoles.roleId,
          });

        const [deleted] = await tx
          .update(roles)
          .set({ deletedAt: new Date() })
          .where(and(eq(roles.id, msg.id), isNull(roles.deletedAt)))
          .returning({ id: roles.id });

        return { deletedAssignments, deleted };
      },
    );

    if (!deleted) {
      return err(new Error(`Role ${msg.id} not found`));
    }

    sendRoleEvent(ctx, {
      type: "event.role.deleted",
      roleId: deleted.id,
    });

    for (const assignment of deletedAssignments) {
      sendRoleEvent(ctx, {
        type: "event.role.unassigned",
        userId: assignment.userId,
        roleId: assignment.roleId,
      });
    }

    return ok();
  },

  "action.role.assign": async (ctx, ws, msg) => {
    if (!canSession(ctx, ws, Permission.MANAGE_ROLES)) {
      return err(
        new Error(`User ${ws.data.userId} is not admin, tryed to assign role`),
      );
    }

    const user = ctx.state.users.find((user) => user.id === msg.userId);

    if (!user) {
      return err(new Error(`User ${msg.userId} not found`));
    }

    const role = ctx.state.roles.find((role) => role.id === msg.roleId);

    if (!role) {
      return err(new Error(`Role ${msg.roleId} not found`));
    }

    const [assignment] = await ctx.db
      .insert(userRoles)
      .values({ userId: msg.userId, roleId: msg.roleId })
      .onConflictDoNothing()
      .returning({
        userId: userRoles.userId,
        roleId: userRoles.roleId,
      });

    if (!assignment) {
      return ok();
    }

    sendRoleEvent(ctx, {
      type: "event.role.assigned",
      userId: assignment.userId,
      roleId: assignment.roleId,
    });

    return ok();
  },

  "action.role.unassign": async (ctx, ws, msg) => {
    if (!canSession(ctx, ws, Permission.MANAGE_ROLES)) {
      return err(
        new Error(
          `User ${ws.data.userId} is not admin, tryed to unassign role`,
        ),
      );
    }

    const [assignment] = await ctx.db
      .delete(userRoles)
      .where(
        and(eq(userRoles.userId, msg.userId), eq(userRoles.roleId, msg.roleId)),
      )
      .returning({
        userId: userRoles.userId,
        roleId: userRoles.roleId,
      });

    if (!assignment) {
      return ok();
    }

    sendRoleEvent(ctx, {
      type: "event.role.unassigned",
      userId: assignment.userId,
      roleId: assignment.roleId,
    });

    return ok();
  },
};
