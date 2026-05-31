import { describe, expect, test } from "bun:test";
import type { PermissionRow, PermissionState } from "$src/permissions";
import { ALL_PERMISSIONS, Permission, apply, has, hasAny, perm, resolve } from "$src/permissions";

function state(overrides: Partial<PermissionState> = {}): PermissionState {
  return {
    users: [
      { id: 1, name: "alice", displayName: null, deletedAt: null, online: false },
      { id: 2, name: "bob", displayName: null, deletedAt: null, online: false },
    ],
    roles: [
      { id: 10, name: "mods", color: 0xff0000, section: false, order: 0 },
      { id: 20, name: "muted", color: 0x000000, section: false, order: 1 },
    ],
    userRoles: [{ userId: 1, roleId: 10 }],
    rooms: [
      {
        id: 100,
        name: "public",
        type: "text",
        visibilityMode: "inherit",
        order: 0,
        nextMessageId: 0,
        deletedAt: null,
      },
      {
        id: 200,
        name: "private",
        type: "text",
        visibilityMode: "private",
        order: 1,
        nextMessageId: 0,
        deletedAt: null,
      },
    ],
    permissions: [],
    ...overrides,
  };
}

function row(row: Omit<PermissionRow, "id"> & { id?: number }): PermissionRow {
  return {
    id: row.id ?? Math.floor(Math.random() * 1_000_000),
    ...row,
  };
}

describe("permission bit helpers", () => {
  test("apply removes denied bits and adds allowed bits", () => {
    const current = Permission.VIEW_ROOM | Permission.SEND_MESSAGES;

    expect(
      apply(current, {
        allow: Permission.DELETE_MESSAGES,
        deny: Permission.SEND_MESSAGES,
      }),
    ).toBe(Permission.VIEW_ROOM | Permission.DELETE_MESSAGES);
  });

  test("ADMIN satisfies has and hasAny checks", () => {
    expect(has(Permission.ADMIN, Permission.MANAGE_USERS | Permission.MANAGE_ROOMS)).toBe(true);
    expect(hasAny(Permission.ADMIN, Permission.MANAGE_USERS)).toBe(true);
  });

  test("has requires every requested bit, while hasAny requires one", () => {
    const mask = Permission.VIEW_ROOM | Permission.SEND_MESSAGES;

    expect(has(mask, Permission.VIEW_ROOM | Permission.SEND_MESSAGES)).toBe(true);
    expect(has(mask, Permission.VIEW_ROOM | Permission.DELETE_MESSAGES)).toBe(false);
    expect(hasAny(mask, Permission.DELETE_MESSAGES | Permission.SEND_MESSAGES)).toBe(true);
    expect(hasAny(mask, Permission.DELETE_MESSAGES | Permission.MANAGE_USERS)).toBe(false);
  });
});

describe("resolve", () => {
  test("unknown users have no permissions", () => {
    expect(resolve(state(), 999)).toBe(0);
  });

  test("global everyone rows grant permissions", () => {
    const s = state({
      permissions: [
        row({
          subjectType: "everyone",
          subjectId: null,
          roomId: null,
          allow: Permission.VIEW_ROOM | Permission.SEND_MESSAGES,
          deny: 0,
        }),
      ],
    });

    expect(resolve(s, 1)).toBe(Permission.VIEW_ROOM | Permission.SEND_MESSAGES);
  });

  test("role rows override everyone rows before user rows override role rows", () => {
    const s = state({
      permissions: [
        row({
          subjectType: "everyone",
          subjectId: null,
          roomId: null,
          allow: Permission.VIEW_ROOM | Permission.SEND_MESSAGES,
          deny: 0,
        }),
        row({
          subjectType: "role",
          subjectId: 10,
          roomId: null,
          allow: Permission.DELETE_MESSAGES,
          deny: Permission.SEND_MESSAGES,
        }),
        row({
          subjectType: "user",
          subjectId: 1,
          roomId: null,
          allow: Permission.SEND_MESSAGES,
          deny: Permission.DELETE_MESSAGES,
        }),
      ],
    });

    expect(resolve(s, 1)).toBe(Permission.VIEW_ROOM | Permission.SEND_MESSAGES);
  });

  test("ADMIN resolves to all permissions", () => {
    const s = state({
      permissions: [
        row({
          subjectType: "user",
          subjectId: 1,
          roomId: null,
          allow: Permission.ADMIN,
          deny: 0,
        }),
      ],
    });

    expect(resolve(s, 1)).toBe(ALL_PERMISSIONS);
    expect(resolve(s, 1, 100)).toBe(ALL_PERMISSIONS);
  });

  test("missing rooms resolve to no room permissions", () => {
    const s = state({
      permissions: [
        row({
          subjectType: "everyone",
          subjectId: null,
          roomId: null,
          allow: Permission.VIEW_ROOM,
          deny: 0,
        }),
      ],
    });

    expect(resolve(s, 1, 999)).toBe(0);
  });

  test("room-specific rows apply after global rows", () => {
    const s = state({
      permissions: [
        row({
          subjectType: "everyone",
          subjectId: null,
          roomId: null,
          allow: Permission.VIEW_ROOM,
          deny: 0,
        }),
        row({
          subjectType: "user",
          subjectId: 1,
          roomId: 100,
          allow: Permission.SEND_MESSAGES,
          deny: 0,
        }),
      ],
    });

    expect(resolve(s, 1, 100)).toBe(Permission.VIEW_ROOM | Permission.SEND_MESSAGES);
    expect(resolve(s, 1, 200)).toBe(0);
  });

  test("private rooms remove inherited VIEW_ROOM unless a room override restores it", () => {
    const privateWithoutOverride = state({
      permissions: [
        row({
          subjectType: "everyone",
          subjectId: null,
          roomId: null,
          allow: Permission.VIEW_ROOM | Permission.SEND_MESSAGES,
          deny: 0,
        }),
      ],
    });

    expect(resolve(privateWithoutOverride, 1, 200)).toBe(0);

    const privateWithOverride = state({
      permissions: [
        row({
          subjectType: "everyone",
          subjectId: null,
          roomId: null,
          allow: Permission.VIEW_ROOM | Permission.SEND_MESSAGES,
          deny: 0,
        }),
        row({
          subjectType: "user",
          subjectId: 1,
          roomId: 200,
          allow: Permission.VIEW_ROOM,
          deny: 0,
        }),
      ],
    });

    expect(resolve(privateWithOverride, 1, 200)).toBe(Permission.VIEW_ROOM | Permission.SEND_MESSAGES);
  });

  test("if final room permissions do not include VIEW_ROOM, resolve returns 0", () => {
    const s = state({
      permissions: [
        row({
          subjectType: "everyone",
          subjectId: null,
          roomId: null,
          allow: Permission.VIEW_ROOM | Permission.SEND_MESSAGES,
          deny: 0,
        }),
        row({
          subjectType: "user",
          subjectId: 1,
          roomId: 100,
          allow: 0,
          deny: Permission.VIEW_ROOM,
        }),
      ],
    });

    expect(resolve(s, 1, 100)).toBe(0);
  });

  test("accessibleRooms filters rooms by resolved VIEW_ROOM", () => {
    const s = state({
      permissions: [
        row({
          subjectType: "everyone",
          subjectId: null,
          roomId: null,
          allow: Permission.VIEW_ROOM,
          deny: 0,
        }),
        row({
          subjectType: "user",
          subjectId: 1,
          roomId: 200,
          allow: 0,
          deny: Permission.VIEW_ROOM,
        }),
      ],
    });

    expect(perm.accessibleRooms(s, 1, s.rooms).map((room) => room.id)).toEqual([100]);
  });
});
