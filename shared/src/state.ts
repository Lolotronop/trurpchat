import type { Key } from "./key";
import type { ServerEvent } from "./protocol";
import type { Role, UserRole } from "./role";
import type { Room } from "./room";
import type { TypingEvent } from "./typing";
import type {
  ConnectedUser,
  ConnectedUserState,
  DbUser,
  OfflineUser,
  User,
} from "./user";

export type VoiceUser = {
  roomId: number;
  userId: number;
};

export type SharedState = {
  users: User[];
  rooms: Room[];
  roles: Role[];
  userRoles: UserRole[];
  keys: Key[];
  voiceUsers: VoiceUser[];
  typing: TypingEvent[];
};

export function createSharedState(): SharedState {
  return {
    users: [],
    rooms: [],
    roles: [],
    userRoles: [],
    keys: [],
    voiceUsers: [],
    typing: [],
  };
}

export function defaultConnectedUserState(): ConnectedUserState {
  return {
    muted: false,
    deafened: false,
    camera: false,
    streaming: false,
    watchedBy: [],
    online: true,
  };
}

export function user(state: SharedState, userId: number): User | undefined {
  return state.users.find((user) => user.id === userId);
}

export function connectedUser(
  state: SharedState,
  userId: number,
): ConnectedUser | undefined {
  const found = user(state, userId);
  return found?.online ? found : undefined;
}

function replaceArray<T>(target: T[], source: T[]) {
  target.splice(0, target.length, ...source);
}

function upsertById<T extends { id: number }>(array: T[], item: T) {
  const existing = array.find((entry) => entry.id === item.id);
  if (existing) {
    Object.assign(existing, item);
  } else {
    array.push(item);
  }
}

function removeById<T extends { id: number }>(array: T[], id: number) {
  const index = array.findIndex((entry) => entry.id === id);
  if (index !== -1) {
    array.splice(index, 1);
  }
}

function toOfflineUser(user: DbUser): OfflineUser {
  return {
    ...user,
    online: false,
  };
}

function patchDbUser(base: User, patch: DbUser): User {
  if (!base.online) {
    Object.assign(base, patch, { online: false });
    return base;
  }

  Object.assign(base, patch, { online: true });
  return base;
}

function upsertDbUser(state: SharedState, value: DbUser) {
  const existing = user(state, value.id);
  if (existing) {
    patchDbUser(existing, value);
  } else {
    state.users.push(toOfflineUser(value));
  }
}

function removeVoiceUser(state: SharedState, roomId: number, userId: number) {
  const index = state.voiceUsers.findIndex(
    (entry) => entry.roomId === roomId && entry.userId === userId,
  );
  if (index !== -1) {
    state.voiceUsers.splice(index, 1);
  }
}

function addVoiceUser(state: SharedState, roomId: number, userId: number) {
  for (let index = state.voiceUsers.length - 1; index >= 0; index--) {
    if (state.voiceUsers[index]?.userId === userId) {
      state.voiceUsers.splice(index, 1);
    }
  }
  state.voiceUsers.push({ roomId, userId });
}

export function patch(state: SharedState, message: ServerEvent) {
  switch (message.type) {
    case "event.room.list":
      replaceArray(state.rooms, message.rooms);
      return;
    case "event.room.updated":
      upsertById(state.rooms, message.room);
      return;
    case "event.room.deleted":
      removeById(state.rooms, message.roomId);
      for (let index = state.voiceUsers.length - 1; index >= 0; index--) {
        if (state.voiceUsers[index]?.roomId === message.roomId) {
          state.voiceUsers.splice(index, 1);
        }
      }
      return;
    case "event.voice.joined":
      addVoiceUser(state, message.room, message.userId);
      return;
    case "event.voice.left":
      removeVoiceUser(state, message.room, message.userId);
      return;
    case "event.user.list":
      replaceArray(state.users, message.users);
      return;
    case "event.user.online": {
      const found = user(state, message.userId);
      if (found && !found.online) {
        Object.assign(found, defaultConnectedUserState());
      }
      return;
    }
    case "event.user.offline": {
      const found = user(state, message.userId);
      if (found) {
        Object.assign(found, { online: false });
      }
      for (let index = state.voiceUsers.length - 1; index >= 0; index--) {
        if (state.voiceUsers[index]?.userId === message.userId) {
          state.voiceUsers.splice(index, 1);
        }
      }
      return;
    }
    case "event.user.created":
      upsertById(state.users, message.user);
      return;
    case "event.user.updated":
      upsertDbUser(state, message.user);
      return;
    case "event.user.deleted":
      removeById(state.users, message.userId);
      for (let index = state.userRoles.length - 1; index >= 0; index--) {
        if (state.userRoles[index]?.userId === message.userId) {
          state.userRoles.splice(index, 1);
        }
      }
      return;
    case "event.user.state":
    case "event.user.me":
      upsertById(state.users, message.user);
      return;
    case "event.role.list":
      replaceArray(state.roles, message.roles);
      replaceArray(state.userRoles, message.assignments);
      return;
    case "event.role.created":
    case "event.role.updated":
      upsertById(state.roles, message.role);
      return;
    case "event.role.deleted":
      removeById(state.roles, message.roleId);
      for (let index = state.userRoles.length - 1; index >= 0; index--) {
        if (state.userRoles[index]?.roleId === message.roleId) {
          state.userRoles.splice(index, 1);
        }
      }
      return;
    case "event.role.assigned":
      if (
        !state.userRoles.some(
          (entry) =>
            entry.userId === message.userId && entry.roleId === message.roleId,
        )
      ) {
        state.userRoles.push({
          userId: message.userId,
          roleId: message.roleId,
        });
      }
      return;
    case "event.role.unassigned": {
      const index = state.userRoles.findIndex(
        (entry) =>
          entry.userId === message.userId && entry.roleId === message.roleId,
      );
      if (index !== -1) {
        state.userRoles.splice(index, 1);
      }
      return;
    }
    case "event.key.list":
      replaceArray(state.keys, message.keys);
      return;
    case "event.typing": {
      const existing = state.typing.find(
        (entry) =>
          entry.roomId === message.roomId && entry.userId === message.userId,
      );
      if (existing) {
        existing.timestamp = message.timestamp;
      } else {
        state.typing.push(message);
      }
      return;
    }
    case "event.message.created": {
      // actual message creation is handled separately in the client cache, this intentionally only updates the room state
      const room = state.rooms.find(
        (room) => room.id === message.message.roomId,
      );
      if (room && room.type === "text") {
        room.nextMessageId = message.message.id + 1;
      }
      return;
    }
    default:
      return;
  }
}
