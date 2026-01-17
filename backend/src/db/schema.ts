import { defineRelations, sql } from "drizzle-orm";
import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const users = sqliteTable("users", {
  id: integer({ mode: "number" }).primaryKey(),
  name: text({ length: 255 }).notNull(),

  /** For now, this will be set to 1 for admins and 0 for everyone else
   * In the future, I plan to expand this to support different permissions
   * as a bit mask. The "catchall" admin wil stay at 1, I guess
   */
  permissions: integer({ mode: "number" }).notNull(),
});

export type User = typeof users.$inferSelect;

export const keys = sqliteTable("keys", {
  id: integer().primaryKey(),
  key: text({ length: 255 }).notNull(),
  userId: integer({ mode: "number" }).notNull(),
  createdAt: integer({ mode: "timestamp_ms" })
    .notNull()
    .$default(() => {
      return sql`${Date.now()}`;
    }),
  lastSeen: integer({ mode: "timestamp_ms" }).notNull().default(new Date(0)),
});

export type Key = typeof keys.$inferSelect;

export const CHANNEL_TYPES = ["text", "voice"] as const;
export const rooms = sqliteTable("rooms", {
  id: integer().primaryKey(),
  name: text({ length: 255 }).notNull(),
  type: text({ mode: "text", enum: CHANNEL_TYPES }).notNull(),
});

export type Room = typeof rooms.$inferSelect;

export const relations = defineRelations({ users, keys }, (r) => ({
  keys: {
    user: r.one.users({
      from: r.keys.userId,
      to: r.users.id,
    }),
  },
  users: {
    keys: r.many.keys(),
  },
}));
