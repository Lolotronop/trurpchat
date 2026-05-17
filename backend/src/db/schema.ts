import { defineRelations, sql } from "drizzle-orm";
import * as t from "drizzle-orm/sqlite-core";
import { sqliteTable as table } from "drizzle-orm/sqlite-core";
import type * as Shared from "trurpchat-shared";

export const users = table("users", {
  id: t.integer({ mode: "number" }).primaryKey(),
  name: t.text({ length: 255 }).notNull(),
  displayName: t.text({ length: 255 }),
  deletedAt: t.integer({ mode: "timestamp_ms" }),
});

export type User = typeof users.$inferSelect;

export const roles = table("roles", {
  id: t.integer({ mode: "number" }).primaryKey(),
  name: t.text({ length: 255 }).notNull(),
  color: t.integer({ mode: "number" }).notNull(),
  section: t.integer({ mode: "boolean" }).notNull().default(false),
  order: t.real().notNull().default(0),
  deletedAt: t.integer({ mode: "timestamp_ms" }),
});

export type Role = typeof roles.$inferSelect;

export const userRoles = table(
  "user_roles",
  {
    userId: t
      .integer({ mode: "number" })
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    roleId: t
      .integer({ mode: "number" })
      .notNull()
      .references(() => roles.id, { onDelete: "cascade" }),
  },
  (tb) => [t.primaryKey({ columns: [tb.userId, tb.roleId] })],
);

export type UserRole = typeof userRoles.$inferSelect;

export const serverMeta = table("server_meta", {
  id: t.text(),
});

export type ServerMeta = typeof serverMeta.$inferSelect;

export const keys = table("keys", {
  id: t.integer().primaryKey(),
  key: t.text({ length: 255 }).notNull(),
  userId: t
    .integer({ mode: "number" })
    .notNull()
    .references(() => users.id),
  createdAt: t
    .integer({ mode: "timestamp_ms" })
    .notNull()
    .$default(() => {
      return sql`${Date.now()}`;
    }),
  lastSeen: t.integer({ mode: "timestamp_ms" }).notNull().default(new Date(0)),
});

export type Key = typeof keys.$inferSelect;

export const CHANNEL_TYPES = ["text", "voice"] as const;
export const ROOM_VISIBILITY_MODES = ["inherit", "private"] as const;
export const rooms = table("rooms", {
  id: t.integer().primaryKey(),
  name: t.text({ length: 255 }).notNull(),
  type: t.text({ mode: "text", enum: CHANNEL_TYPES }).notNull(),
  visibilityMode: t
    .text("visibility_mode", { mode: "text", enum: ROOM_VISIBILITY_MODES })
    .notNull()
    .default("inherit"),
  order: t.real().notNull(),
  nextMessageId: t.integer().notNull().default(0),
  deletedAt: t.integer({ mode: "timestamp_ms" }),
});

export type Room = typeof rooms.$inferSelect;

export const PERMISSION_SUBJECT_TYPES = ["everyone", "role", "user"] as const;
export const permissions = table(
  "permissions",
  {
    id: t.integer().primaryKey(),
    subjectType: t
      .text("subject_type", { mode: "text", enum: PERMISSION_SUBJECT_TYPES })
      .notNull(),
    subjectId: t.integer("subject_id", { mode: "number" }),
    roomId: t
      .integer("room_id", { mode: "number" })
      .references(() => rooms.id, { onDelete: "cascade" }),
    allow: t.integer({ mode: "number" }).notNull().default(0),
    deny: t.integer({ mode: "number" }).notNull().default(0),
  },
  (tb) => [
    t.check(
      "permissions_subject_check",
      sql`(${tb.subjectType} = 'everyone' AND ${tb.subjectId} IS NULL) OR (${tb.subjectType} IN ('role', 'user') AND ${tb.subjectId} IS NOT NULL)`,
    ),
    t.uniqueIndex("permissions_unique").on(
      tb.subjectType,
      tb.subjectId,
      tb.roomId,
    ),
  ],
);

export type Permission = typeof permissions.$inferSelect;

type AttachmentData =
  | {
      type: "image" | "video";
      path: string;
      width: number;
      height: number;
    }
  | {
      type: "audio";
      duration: number;
    }
  | {
      type: "file";
      mimeType: string;
    };

type Attachment = {
  data: AttachmentData;
  name: string;
  path: string;
  size: number;
};

export const messages = table(
  "messages",
  {
    /** id is local to the room */
    id: t.integer().notNull(),
    roomId: t
      .integer({ mode: "number" })
      .notNull()
      .references(() => rooms.id, { onDelete: "cascade" }),

    userId: t
      .integer({ mode: "number" })
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),

    text: t.text().notNull(),
    attachments: t.text({ mode: "json" }).$type<Attachment[]>(),
    replyTo: t.integer({ mode: "number" }),

    createdAt: t
      .integer({ mode: "timestamp_ms" })
      .notNull()
      .$default(() => {
        return sql`${Date.now()}`;
      }),

    editedAt: t.integer({ mode: "timestamp_ms" }),
    edited: t.integer({ mode: "boolean" }).notNull().default(false),
    deletedAt: t.integer({ mode: "timestamp_ms" }),

    /** Essentially a cache for the frontend to not recompute this every time */
    hasMention: t.integer({ mode: "boolean" }).notNull().default(false),
  },
  (tb) => [t.primaryKey({ columns: [tb.id, tb.roomId] })],
);
export type Message = typeof messages.$inferSelect;

export const unread = table(
  "unread",
  {
    roomId: t
      .integer()
      .notNull()
      .references(() => rooms.id, { onDelete: "cascade" }),
    userId: t
      .integer()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),

    /** The id of the last message in the room that was not read */
    unreadId: t.integer().notNull().default(0),
  },
  (tb) => [t.primaryKey({ columns: [tb.userId, tb.roomId] })],
);

export type UnreadRow = typeof unread.$inferSelect;

type Equal<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2
    ? (<T>() => T extends B ? 1 : 2) extends <T>() => T extends A ? 1 : 2
      ? true
      : false
    : false;

type Assert<T extends true> = T;

// These assertions intentionally make the backend fail type-checking when the
// Drizzle schema drifts away from the explicit shared primitive types.
type _AssertUsersMatchShared = Assert<Equal<User, Shared.UserData>>;
type _AssertRolesMatchShared = Assert<Equal<Role, Shared.RoleData>>;
type _AssertUserRolesMatchShared = Assert<Equal<UserRole, Shared.UserRoleData>>;
type _AssertServerMetaMatchesShared = Assert<
  Equal<ServerMeta, Shared.ServerMeta>
>;
type _AssertKeysMatchShared = Assert<Equal<Key, Shared.Key>>;
type _AssertRoomsMatchShared = Assert<Equal<Room, Shared.Room>>;
type _AssertPermissionsMatchShared = Assert<
  Equal<Permission, Shared.PermissionRow>
>;
type _AssertMessagesMatchShared = Assert<Equal<Message, Shared.TextMessage>>;
type _AssertUnreadMatchesShared = Assert<Equal<UnreadRow, Shared.UnreadRow>>;

export const relations = defineRelations(
  { users, roles, userRoles, keys, messages, rooms, serverMeta, permissions },
  (r) => ({
    keys: {
      user: r.one.users({
        from: r.keys.userId,
        to: r.users.id,
      }),
    },
    users: {
      keys: r.many.keys(),
      userRoles: r.many.userRoles(),
      messages: r.many.messages(),
    },
    roles: {
      userRoles: r.many.userRoles(),
    },
    userRoles: {
      user: r.one.users({
        from: r.userRoles.userId,
        to: r.users.id,
      }),
      role: r.one.roles({
        from: r.userRoles.roleId,
        to: r.roles.id,
      }),
    },
    rooms: {
      messages: r.many.messages(),
      permissions: r.many.permissions(),
    },
    permissions: {
      room: r.one.rooms({
        from: r.permissions.roomId,
        to: r.rooms.id,
      }),
    },
    messages: {
      room: r.one.rooms({
        from: r.messages.roomId,
        to: r.rooms.id,
      }),
      user: r.one.users({
        from: r.messages.userId,
        to: r.users.id,
      }),
    },
  }),
);
