import { drizzle } from "drizzle-orm/bun-sqlite";
import { keys, relations, type Key } from "./schema";
export * from "./schema";

export const db = drizzle(process.env.DATABASE_URL!, { relations });

export async function createKey(userId: number) {
  const keyData: Pick<Key, "key" | "userId"> = {
    key: Math.random().toString(36).slice(4),
    userId,
  };
  await db.insert(keys).values([keyData]);
}
