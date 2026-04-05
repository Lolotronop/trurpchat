import { count } from "drizzle-orm";
import { db, type Key, keys, rooms, users } from "./db";

export async function getKeys() {
  return await db.query.keys.findMany({
    columns: {
      key: true,
    },
    with: {
      user: {
        columns: {
          name: true,
        },
      },
    },
  });
}

export async function seed() {
  await Promise.all([seedRooms(), seedUsers()]);
}

async function seedUsers() {
  const [countRow] = await db
    .select({
      count: count(users.id),
    })
    .from(users);

  if (!countRow) {
    console.error("Conudn't count ma usas");
    return;
  }

  const { count: userCount } = countRow;
  if (userCount !== 0) {
    return;
  }

  const result = await db
    .insert(users)
    .values([
      {
        name: "Helium",
        permissions: 1,
      },
      {
        name: "Tester",
        permissions: 0,
      },
      {
        name: "Firefox",
        permissions: 0,
      },
    ])
    .returning();

  const newKeys = result.map((user) => {
    const key: Pick<Key, "key" | "userId"> = {
      key: Math.random().toString(36).slice(4),
      userId: user.id,
    };
    return key;
  });

  console.log(newKeys);

  await db.insert(keys).values(newKeys);
}

async function seedRooms() {
  const [countRow] = await db
    .select({
      count: count(rooms.id),
    })
    .from(rooms);

  if (!countRow) {
    console.error("Conudn't count ma usas");
    return;
  }

  const { count: userCount } = countRow;
  if (userCount !== 0) {
    return;
  }

  await db.insert(rooms).values([
    {
      name: "Альфа",
      type: "voice",
      order: 1,
    },
    {
      name: "Бета",
      type: "voice",
      order: 2,
    },
    {
      name: "Гамма",
      type: "voice",
      order: 3,
    },
  ]);
}
