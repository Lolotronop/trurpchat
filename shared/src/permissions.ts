import type { SharedState } from "./state";

export const Permission = {
  /** Administrator: grants every permission. Keep this as bit 1. */
  ADMIN: 1 << 0,

  MANAGE_USERS: 1 << 1,
  MANAGE_ROLES: 1 << 2,
  MANAGE_KEYS: 1 << 3,
  MANAGE_ROOMS: 1 << 4,
  MANAGE_PERMISSIONS: 1 << 5,

  VIEW_ROOM: 1 << 6,
  SEND_MESSAGES: 1 << 7,
  SEND_ATTACHMENTS: 1 << 8,
  DELETE_MESSAGES: 1 << 9,

  STREAM: 1 << 10,
  PAUSE_STREAMS: 1 << 11,

  MUTE_MEMBERS: 1 << 12,
  DEAFEN_MEMBERS: 1 << 13,
  MOVE_MEMBERS: 1 << 14,
  DISCONNECT_MEMBERS: 1 << 15,
} as const;

export type PermissionName = keyof typeof Permission;
export type PermissionMask = number;
export type PermissionSubjectType = "everyone" | "role" | "user";
export type PermissionVisibilityMode = "inherit" | "private";

export const ALL_PERMISSIONS = Object.values(Permission).reduce(
  (mask, bit) => mask | bit,
  0,
);

export const DEFAULT_EVERYONE_PERMISSIONS =
  Permission.VIEW_ROOM |
  Permission.SEND_MESSAGES |
  Permission.SEND_ATTACHMENTS |
  Permission.STREAM |
  Permission.PAUSE_STREAMS;

export const permissionInfo: Record<
  PermissionName,
  { label: string; description: string; scope: "global" | "room" | "both" }
> = {
  ADMIN: {
    label: "Администратор",
    description: "Полный доступ ко всему.",
    scope: "global",
  },
  MANAGE_USERS: {
    label: "Управление пользователями",
    description: "Создание, изменение и удаление пользователей.",
    scope: "global",
  },
  MANAGE_ROLES: {
    label: "Управление ролями",
    description: "Создание, изменение, удаление, назначение и снятие ролей.",
    scope: "global",
  },
  MANAGE_KEYS: {
    label: "Управление ключами",
    description:
      "Создание, отзыв и просмотр ключей входа других пользователей.",
    scope: "global",
  },
  MANAGE_ROOMS: {
    label: "Управление комнатами",
    description: "Создание, изменение, сортировка и удаление комнат.",
    scope: "both",
  },
  MANAGE_PERMISSIONS: {
    label: "Управление правами",
    description: "Создание, изменение и удаление переопределений прав.",
    scope: "global",
  },
  VIEW_ROOM: {
    label: "Просмотр комнаты",
    description:
      "Видеть комнату, читать историю, входить в голос, смотреть трансляции и отправлять RTC для неё.",
    scope: "room",
  },
  SEND_MESSAGES: {
    label: "Отправка сообщений",
    description: "Отправка сообщений в текстовых комнатах.",
    scope: "room",
  },
  SEND_ATTACHMENTS: {
    label: "Отправка вложений",
    description: "Прикрепление файлов к сообщениям в текстовых комнатах.",
    scope: "room",
  },
  DELETE_MESSAGES: {
    label: "Удаление сообщений",
    description: "Удаление сообщений других пользователей.",
    scope: "room",
  },
  STREAM: {
    label: "Трансляция",
    description: "Демонстрация камеры или экрана в видимых голосовых комнатах.",
    scope: "room",
  },
  PAUSE_STREAMS: {
    label: "Пауза трансляций",
    description: "Запросить паузу трансляции другого пользователя.",
    scope: "room",
  },
  MUTE_MEMBERS: {
    label: "Отключение микрофона",
    description: "Отключение микрофона другим пользователям на сервере.",
    scope: "room",
  },
  DEAFEN_MEMBERS: {
    label: "Отключение звука",
    description: "Отключение звука другим пользователям на сервере.",
    scope: "room",
  },
  MOVE_MEMBERS: {
    label: "Перемещение участников",
    description: "Перемещение пользователей между голосовыми комнатами.",
    scope: "room",
  },
  DISCONNECT_MEMBERS: {
    label: "Отключение участников",
    description: "Отключение пользователей от голосовых комнат.",
    scope: "room",
  },
};

export type PermissionRow = {
  id: number;
  subjectType: PermissionSubjectType;
  /** null only for subjectType === "everyone" */
  subjectId: number | null;
  /** null means global/server-wide; a number means room-specific. */
  roomId: number | null;
  allow: PermissionMask;
  deny: PermissionMask;
};

export type PermissionCreate = Omit<PermissionRow, "id">;
export type PermissionUpdate = Pick<PermissionRow, "id"> &
  Partial<Omit<PermissionRow, "id">>;

export type PermissionAction =
  | { type: "action.permission.list" }
  | { type: "action.permission.create"; permission: PermissionCreate }
  | { type: "action.permission.update"; permission: PermissionUpdate }
  | { type: "action.permission.delete"; id: number };

export type PermissionEvent =
  | { type: "event.permission.list"; permissions: PermissionRow[] }
  | { type: "event.permission.created"; permission: PermissionRow }
  | { type: "event.permission.updated"; permission: PermissionRow }
  | { type: "event.permission.deleted"; id: number };

export type PermissionState = Pick<
  SharedState,
  "users" | "roles" | "userRoles" | "rooms" | "permissions"
>;

export function apply(
  current: PermissionMask,
  row: Pick<PermissionRow, "allow" | "deny">,
): PermissionMask {
  return (current & ~row.deny) | row.allow;
}

export function has(mask: PermissionMask, required: PermissionMask): boolean {
  return (
    (mask & Permission.ADMIN) === Permission.ADMIN ||
    (mask & required) === required
  );
}

export function hasAny(
  mask: PermissionMask,
  required: PermissionMask,
): boolean {
  return (
    (mask & Permission.ADMIN) === Permission.ADMIN || (mask & required) !== 0
  );
}

function rowApplies(row: PermissionRow, userId: number, roleIds: Set<number>) {
  if (row.subjectType === "everyone") return true;
  if (row.subjectType === "user") return row.subjectId === userId;
  return row.subjectId !== null && roleIds.has(row.subjectId);
}

function precedence(row: PermissionRow) {
  if (row.subjectType === "everyone") return 0;
  if (row.subjectType === "role") return 1;
  return 2;
}

export function resolve(
  state: PermissionState,
  userId: number,
  roomId?: number,
): PermissionMask {
  if (!state.users.some((user) => user.id === userId)) {
    return 0;
  }

  const roleIds = new Set(
    state.userRoles
      .filter((assignment) => assignment.userId === userId)
      .map((assignment) => assignment.roleId),
  );

  let mask = 0;
  const globalRows = state.permissions
    .filter((row) => row.roomId === null)
    .filter((row) => rowApplies(row, userId, roleIds))
    .sort((a, b) => precedence(a) - precedence(b));

  for (const row of globalRows) {
    mask = apply(mask, row);
  }

  if (has(mask, Permission.ADMIN)) {
    return ALL_PERMISSIONS;
  }

  if (roomId === undefined) {
    return mask;
  }

  const room = state.rooms.find((room) => room.id === roomId);
  if (!room) {
    return 0;
  }

  if (room.visibilityMode === "private") {
    mask &= ~Permission.VIEW_ROOM;
  }

  const roomRows = state.permissions
    .filter((row) => row.roomId === roomId)
    .filter((row) => rowApplies(row, userId, roleIds))
    .sort((a, b) => precedence(a) - precedence(b));

  for (const row of roomRows) {
    mask = apply(mask, row);
  }

  if (!has(mask, Permission.VIEW_ROOM)) {
    return 0;
  }

  return mask;
}

export function can(
  state: PermissionState,
  required: PermissionMask,
  userId: number,
  roomId?: number,
): boolean {
  return has(resolve(state, userId, roomId), required);
}

export function accessibleRooms<
  T extends { id: number; visibilityMode?: PermissionVisibilityMode },
>(state: PermissionState, userId: number, rooms: T[]): T[] {
  return rooms.filter((room) =>
    can(state, Permission.VIEW_ROOM, userId, room.id),
  );
}

export const perm = {
  bit: Permission,
  info: permissionInfo,
  all: ALL_PERMISSIONS,
  defaults: { everyone: DEFAULT_EVERYONE_PERMISSIONS },
  apply,
  has,
  hasAny,
  resolve,
  can,
  accessibleRooms,
} as const;
