import { Database } from "bun:sqlite";
import { parse } from "devalue";
import { drizzle } from "drizzle-orm/bun-sqlite";
import type { Message, ServerEvent } from "trurpchat-shared";
import { createSharedState, Permission } from "trurpchat-shared";
import type { BackendDb } from "$src/db";
import {
  keys,
  permissions,
  relations,
  roles,
  rooms,
  runMigrations,
  users,
} from "$src/db";
import type { HandlerContext } from "$src/handler";
import type { WsClient } from "$src/voice";

export type TestClient = WsClient & {
  sent: Message[];
  closed: boolean;
};

export function createTestDb(): BackendDb {
  const sqlite = new Database(":memory:");
  const database = drizzle({ client: sqlite, relations }) as BackendDb;
  runMigrations(database);
  return database;
}

export function createClient(userId: number): TestClient {
  const client = {
    data: { userId },
    sent: [] as Message[],
    closed: false,
    send(payload: string) {
      this.sent.push(parse(payload) as Message);
      return 1;
    },
    close() {
      this.closed = true;
    },
  };
  return client as TestClient;
}

export function createCtx(db = createTestDb()): HandlerContext {
  return {
    db,
    clients: new Map(),
    state: createSharedState(),
  };
}

export function addClient(ctx: HandlerContext, userId: number) {
  const client = createClient(userId);
  ctx.clients.set(userId, client);
  return client;
}

export function lastSent<T extends Message = ServerEvent>(
  client: TestClient,
): T {
  const message = client.sent.at(-1);
  if (!message) {
    throw new Error(
      `Client ${client.data.userId} did not receive any messages`,
    );
  }
  return message as T;
}

export function seedState(ctx: HandlerContext) {
  ctx.state.users.push(
    {
      id: 1,
      name: "admin",
      displayName: null,
      deletedAt: null,
      online: true,
      muted: false,
      deafened: false,
      camera: false,
      streaming: false,
      watchedBy: [],
    },
    {
      id: 2,
      name: "alice",
      displayName: null,
      deletedAt: null,
      online: true,
      muted: false,
      deafened: false,
      camera: false,
      streaming: false,
      watchedBy: [],
    },
    { id: 3, name: "bob", displayName: null, deletedAt: null, online: false },
  );
  ctx.state.rooms.push(
    {
      id: 10,
      name: "text",
      type: "text",
      visibilityMode: "inherit",
      order: 0,
      nextMessageId: 0,
      deletedAt: null,
    },
    {
      id: 20,
      name: "voice",
      type: "voice",
      visibilityMode: "inherit",
      order: 1,
      nextMessageId: 0,
      deletedAt: null,
    },
  );
  ctx.state.roles.push({
    id: 100,
    name: "role",
    color: 0,
    section: false,
    order: 0,
  });
  ctx.state.permissions.push(
    {
      id: 1,
      subjectType: "everyone",
      subjectId: null,
      roomId: null,
      allow:
        Permission.VIEW_ROOM |
        Permission.SEND_MESSAGES |
        Permission.STREAM |
        Permission.PAUSE_STREAMS,
      deny: 0,
    },
    {
      id: 2,
      subjectType: "user",
      subjectId: 1,
      roomId: null,
      allow: Permission.ADMIN,
      deny: 0,
    },
  );
  ctx.state.keys.push(
    {
      id: 1,
      key: "admin-key",
      userId: 1,
      createdAt: new Date(0),
      lastSeen: new Date(0),
    },
    {
      id: 2,
      key: "alice-key",
      userId: 2,
      createdAt: new Date(0),
      lastSeen: new Date(0),
    },
  );
}

export async function seedDb(ctx: HandlerContext) {
  await ctx.db.insert(users).values([
    { id: 1, name: "admin" },
    { id: 2, name: "alice" },
    { id: 3, name: "bob" },
  ]);
  await ctx.db.insert(rooms).values([
    {
      id: 10,
      name: "text",
      type: "text",
      visibilityMode: "inherit",
      order: 0,
      nextMessageId: 0,
    },
    {
      id: 20,
      name: "voice",
      type: "voice",
      visibilityMode: "inherit",
      order: 1,
      nextMessageId: 0,
    },
  ]);
  await ctx.db
    .insert(roles)
    .values([{ id: 100, name: "role", color: 0, section: false, order: 0 }]);
  await ctx.db.insert(permissions).values([
    {
      id: 1,
      subjectType: "everyone",
      subjectId: null,
      roomId: null,
      allow:
        Permission.VIEW_ROOM |
        Permission.SEND_MESSAGES |
        Permission.STREAM |
        Permission.PAUSE_STREAMS,
      deny: 0,
    },
    {
      id: 2,
      subjectType: "user",
      subjectId: 1,
      roomId: null,
      allow: Permission.ADMIN,
      deny: 0,
    },
  ]);
  await ctx.db.insert(keys).values([
    { id: 1, key: "admin-key", userId: 1 },
    { id: 2, key: "alice-key", userId: 2 },
  ]);
}

export async function createSeededContext() {
  const ctx = createCtx();
  seedState(ctx);
  await seedDb(ctx);
  const admin = addClient(ctx, 1);
  const alice = addClient(ctx, 2);
  return { ctx, admin, alice };
}
