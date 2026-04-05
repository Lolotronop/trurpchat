import { drizzle } from "drizzle-orm/bun-sqlite";
import { type Key, keys, relations, serverMeta } from "./schema";

export * from "./schema";

const url = process.env.DATABASE_URL;
if (!url) {
  throw new Error("DATABASE_URL is not set");
}
export const db = drizzle(url, { relations });

export async function createKey(userId: number) {
  const keyData: Pick<Key, "key" | "userId"> = {
    key: Math.random().toString(36).slice(4),
    userId,
  };
  await db.insert(keys).values([keyData]);
}

export async function getOrCreateServerId() {
  const [existing] = await db.select().from(serverMeta).limit(1);

  if (existing?.id) {
    return existing.id;
  }

  const id = crypto.randomUUID();

  if (existing) {
    await db.update(serverMeta).set({ id });
  } else {
    await db.insert(serverMeta).values({ id });
  }

  return id;
}
