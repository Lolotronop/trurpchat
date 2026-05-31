import { describe, expect, test } from "bun:test";
import type { PermissionRow, Role, Room, SharedState, User } from "$src";
import { createSharedState, defaultConnectedUserState, patch } from "$src/state";

function room(id: number, extra: Partial<Room> = {}): Room {
  return {
    id,
    name: `room-${id}`,
    type: "text",
    visibilityMode: "inherit",
    order: id,
    nextMessageId: 0,
    deletedAt: null,
    ...extra,
  };
}

function role(id: number): Role {
  return {
    id,
    name: `role-${id}`,
    color: 0,
    section: false,
    order: id,
  };
}

function offlineUser(id: number): User {
  return {
    id,
    name: `user-${id}`,
    displayName: null,
    deletedAt: null,
    online: false,
  };
}

function connectedUser(id: number): User {
  return {
    ...offlineUser(id),
    ...defaultConnectedUserState(),
  };
}

function permission(row: Omit<PermissionRow, "id"> & { id: number }): PermissionRow {
  return row;
}

describe("createSharedState", () => {
  test("creates empty arrays for every state slice", () => {
    expect(createSharedState()).toEqual({
      users: [],
      rooms: [],
      roles: [],
      userRoles: [],
      permissions: [],
      keys: [],
      voiceUsers: [],
      typing: [],
    });
  });
});

describe("patch room events", () => {
  test("room list replaces existing rooms", () => {
    const state = createSharedState();
    state.rooms.push(room(1));

    patch(state, { type: "event.room.list", rooms: [room(2), room(3)] });

    expect(state.rooms.map((entry) => entry.id)).toEqual([2, 3]);
  });

  test("room update upserts by id", () => {
    const state = createSharedState();
    state.rooms.push(room(1, { name: "old" }));

    patch(state, { type: "event.room.updated", room: room(1, { name: "new" }) });
    patch(state, { type: "event.room.updated", room: room(2) });

    expect(state.rooms.map((entry) => [entry.id, entry.name])).toEqual([
      [1, "new"],
      [2, "room-2"],
    ]);
  });

  test("room delete removes room, room permissions, and voice users in that room", () => {
    const state = createSharedState();
    state.rooms.push(room(1), room(2));
    state.permissions.push(
      permission({ id: 1, subjectType: "everyone", subjectId: null, roomId: 1, allow: 1, deny: 0 }),
      permission({ id: 2, subjectType: "everyone", subjectId: null, roomId: 2, allow: 1, deny: 0 }),
      permission({ id: 3, subjectType: "everyone", subjectId: null, roomId: null, allow: 1, deny: 0 }),
    );
    state.voiceUsers.push({ roomId: 1, userId: 10 }, { roomId: 2, userId: 20 });

    patch(state, { type: "event.room.deleted", roomId: 1 });

    expect(state.rooms.map((entry) => entry.id)).toEqual([2]);
    expect(state.permissions.map((entry) => entry.id)).toEqual([2, 3]);
    expect(state.voiceUsers).toEqual([{ roomId: 2, userId: 20 }]);
  });
});

describe("patch voice events", () => {
  test("voice joined moves a user between rooms instead of duplicating them", () => {
    const state = createSharedState();

    patch(state, { type: "event.voice.joined", room: 1, userId: 10 });
    patch(state, { type: "event.voice.joined", room: 2, userId: 10 });

    expect(state.voiceUsers).toEqual([{ roomId: 2, userId: 10 }]);
  });

  test("voice left removes only matching room/user pair", () => {
    const state = createSharedState();
    state.voiceUsers.push({ roomId: 1, userId: 10 }, { roomId: 2, userId: 20 });

    patch(state, { type: "event.voice.left", room: 1, userId: 10 });

    expect(state.voiceUsers).toEqual([{ roomId: 2, userId: 20 }]);
  });
});

describe("patch user events", () => {
  test("user online turns an offline user into a connected user with default state", () => {
    const state = createSharedState();
    state.users.push(offlineUser(1));

    patch(state, { type: "event.user.online", userId: 1 });

    expect(state.users[0]).toEqual({
      id: 1,
      name: "user-1",
      displayName: null,
      deletedAt: null,
      ...defaultConnectedUserState(),
    });
  });

  test("user offline marks user offline and removes them from voice rooms", () => {
    const state = createSharedState();
    state.users.push(connectedUser(1));
    state.voiceUsers.push({ roomId: 1, userId: 1 }, { roomId: 2, userId: 2 });

    patch(state, { type: "event.user.offline", userId: 1 });

    expect(state.users[0]?.online).toBe(false);
    expect(state.voiceUsers).toEqual([{ roomId: 2, userId: 2 }]);
  });

  test("user updated preserves online state and patches db fields", () => {
    const state = createSharedState();
    state.users.push(connectedUser(1));

    patch(state, {
      type: "event.user.updated",
      user: { id: 1, name: "renamed", displayName: "display", deletedAt: null },
    });

    expect(state.users[0]).toMatchObject({
      id: 1,
      name: "renamed",
      displayName: "display",
      online: true,
    });
  });

  test("user deleted removes user, assignments, and user-targeted permissions", () => {
    const state = createSharedState();
    state.users.push(offlineUser(1), offlineUser(2));
    state.userRoles.push({ userId: 1, roleId: 10 }, { userId: 2, roleId: 20 });
    state.permissions.push(
      permission({ id: 1, subjectType: "user", subjectId: 1, roomId: null, allow: 1, deny: 0 }),
      permission({ id: 2, subjectType: "user", subjectId: 2, roomId: null, allow: 1, deny: 0 }),
      permission({ id: 3, subjectType: "role", subjectId: 10, roomId: null, allow: 1, deny: 0 }),
    );

    patch(state, { type: "event.user.deleted", userId: 1 });

    expect(state.users.map((entry) => entry.id)).toEqual([2]);
    expect(state.userRoles).toEqual([{ userId: 2, roleId: 20 }]);
    expect(state.permissions.map((entry) => entry.id)).toEqual([2, 3]);
  });
});

describe("patch role and permission events", () => {
  test("role list replaces roles and assignments", () => {
    const state = createSharedState();
    state.roles.push(role(1));
    state.userRoles.push({ userId: 1, roleId: 1 });

    patch(state, {
      type: "event.role.list",
      roles: [role(2)],
      assignments: [{ userId: 2, roleId: 2 }],
    });

    expect(state.roles.map((entry) => entry.id)).toEqual([2]);
    expect(state.userRoles).toEqual([{ userId: 2, roleId: 2 }]);
  });

  test("role deleted removes role, assignments, and role-targeted permissions", () => {
    const state = createSharedState();
    state.roles.push(role(1), role(2));
    state.userRoles.push({ userId: 1, roleId: 1 }, { userId: 2, roleId: 2 });
    state.permissions.push(
      permission({ id: 1, subjectType: "role", subjectId: 1, roomId: null, allow: 1, deny: 0 }),
      permission({ id: 2, subjectType: "role", subjectId: 2, roomId: null, allow: 1, deny: 0 }),
      permission({ id: 3, subjectType: "user", subjectId: 1, roomId: null, allow: 1, deny: 0 }),
    );

    patch(state, { type: "event.role.deleted", roleId: 1 });

    expect(state.roles.map((entry) => entry.id)).toEqual([2]);
    expect(state.userRoles).toEqual([{ userId: 2, roleId: 2 }]);
    expect(state.permissions.map((entry) => entry.id)).toEqual([2, 3]);
  });

  test("role assignment is idempotent and unassignment removes matching pair", () => {
    const state = createSharedState();

    patch(state, { type: "event.role.assigned", userId: 1, roleId: 10 });
    patch(state, { type: "event.role.assigned", userId: 1, roleId: 10 });
    patch(state, { type: "event.role.assigned", userId: 2, roleId: 10 });
    patch(state, { type: "event.role.unassigned", userId: 1, roleId: 10 });

    expect(state.userRoles).toEqual([{ userId: 2, roleId: 10 }]);
  });

  test("permission list replaces permissions and created/updated upsert by id", () => {
    const state = createSharedState();
    const first = permission({ id: 1, subjectType: "everyone", subjectId: null, roomId: null, allow: 1, deny: 0 });

    patch(state, { type: "event.permission.list", permissions: [first] });
    patch(state, {
      type: "event.permission.updated",
      permission: { ...first, allow: 2 },
    });
    patch(state, {
      type: "event.permission.created",
      permission: permission({ id: 2, subjectType: "everyone", subjectId: null, roomId: null, allow: 4, deny: 0 }),
    });

    expect(state.permissions.map((entry) => [entry.id, entry.allow])).toEqual([
      [1, 2],
      [2, 4],
    ]);
  });
});

describe("patch misc events", () => {
  test("key list replaces keys", () => {
    const state = createSharedState();

    patch(state, {
      type: "event.key.list",
      keys: [
        {
          id: 1,
          key: "abc",
          userId: 1,
          createdAt: new Date(0),
          lastSeen: new Date(0),
        },
      ],
    });

    expect(state.keys.map((entry) => entry.key)).toEqual(["abc"]);
  });

  test("typing events upsert by room and user", () => {
    const state = createSharedState();
    const first = new Date(1);
    const second = new Date(2);

    patch(state, { type: "event.typing", roomId: 1, userId: 1, timestamp: first });
    patch(state, { type: "event.typing", roomId: 1, userId: 1, timestamp: second });
    patch(state, { type: "event.typing", roomId: 1, userId: 2, timestamp: first });

    expect(state.typing).toEqual([
      { type: "event.typing", roomId: 1, userId: 1, timestamp: second },
      { type: "event.typing", roomId: 1, userId: 2, timestamp: first },
    ]);
  });

  test("message created advances text room nextMessageId only", () => {
    const state = createSharedState();
    state.rooms.push(room(1, { type: "text", nextMessageId: 0 }), room(2, { type: "voice", nextMessageId: 0 }));

    const message = {
      id: 41,
      roomId: 1,
      userId: 1,
      text: "hello",
      attachments: null,
      replyTo: null,
      createdAt: new Date(0),
      editedAt: null,
      edited: false,
      deletedAt: null,
      hasMention: false,
    };

    patch(state, { type: "event.message.created", message });
    patch(state, { type: "event.message.created", message: { ...message, roomId: 2 } });

    expect(state.rooms.map((entry) => [entry.id, entry.nextMessageId])).toEqual([
      [1, 42],
      [2, 0],
    ]);
  });

  test("unknown events are ignored", () => {
    const state: SharedState = createSharedState();

    patch(state, { type: "event.unknown" } as never);

    expect(state).toEqual(createSharedState());
  });
});
