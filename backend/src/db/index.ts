import { join } from "node:path";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import { type Key, keys, relations, serverMeta } from "./schema";

export * from "./schema";

const url = process.env.DATABASE_URL;
if (!url) {
  throw new Error("DATABASE_URL is not set");
}
export const db = drizzle(url, { relations });
export type BackendDb = typeof db;

export function runMigrations(
  database: BackendDb = db,
  migrationsFolder = join(import.meta.dir, "../../drizzle"),
) {
  migrate(database, { migrationsFolder });
}

export async function createKey(database: BackendDb, userId: number) {
  const keyData: Pick<Key, "key" | "userId"> = {
    key: Math.random().toString(36).slice(4),
    userId,
  };
  await database.insert(keys).values([keyData]);
}

export async function getOrCreateServerId(database: BackendDb = db) {
  const [existing] = await database.select().from(serverMeta).limit(1);

  if (existing?.id) {
    return existing.id;
  }

  const id = crypto.randomUUID();

  if (existing) {
    await database.update(serverMeta).set({ id });
  } else {
    await database.insert(serverMeta).values({ id });
  }

  return id;
}
