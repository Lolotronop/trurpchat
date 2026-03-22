import { defineRelations, sql } from "drizzle-orm";
import { sqliteTable as table } from "drizzle-orm/sqlite-core";
import * as t from "drizzle-orm/sqlite-core";

export const users = table("users", {
  id: t.integer({ mode: "number" }).primaryKey(),
  name: t.text({ length: 255 }).notNull(),

  /** For now, this will be set to 1 for admins and 0 for everyone else
   * In the future, I plan to expand this to support different permissions
   * as a bit mask. The "catchall" admin wil stay at 1, I guess
   */
  permissions: t.integer({ mode: "number" }).notNull(),
  deletedAt: t.integer({ mode: "timestamp_ms" }),
});

export type User = typeof users.$inferSelect;

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
export const rooms = table("rooms", {
  id: t.integer().primaryKey(),
  name: t.text({ length: 255 }).notNull(),
  type: t.text({ mode: "text", enum: CHANNEL_TYPES }).notNull(),
  order: t.real().notNull(),
  deletedAt: t.integer({ mode: "timestamp_ms" }),
});

export type Room = typeof rooms.$inferSelect;

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
    deletedAt: t.integer({ mode: "timestamp_ms" }),
  },
  (tb) => [t.primaryKey({ columns: [tb.id, tb.roomId] })],
);

export const room_last_id = table("room_last_id", {
  roomId: t.integer({ mode: "number" }).primaryKey(),
  lastId: t.integer().notNull(),
});

export const relations = defineRelations(
  { users, keys, messages, rooms },
  (r) => ({
    keys: {
      user: r.one.users({
        from: r.keys.userId,
        to: r.users.id,
      }),
    },
    users: {
      keys: r.many.keys(),
      messages: r.many.messages(),
    },
    rooms: {
      messages: r.many.messages(),
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
