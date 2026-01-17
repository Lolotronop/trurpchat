import { drizzle } from "drizzle-orm/bun-sqlite";
import { relations, users } from "./schema";
export * from "./schema";

export const db = drizzle(process.env.DATABASE_URL!, { relations });
