import { count } from "drizzle-orm";
import type { PermissionCreate } from "trurpchat-shared";
import {
  DEFAULT_EVERYONE_PERMISSIONS,
  Permission,
} from "trurpchat-shared";
import { db, type Key, keys, permissions, rooms, users } from "./db";

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
  await seedPermissions();
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
      },
      {
        name: "Tester",
      },
      {
        name: "Firefox",
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

async function seedPermissions() {
  const [countRow] = await db
    .select({
      count: count(permissions.id),
    })
    .from(permissions);

  if (!countRow || countRow.count !== 0) {
    return;
  }

  const [admin] = await db.select({ id: users.id }).from(users).limit(1);
  const values: PermissionCreate[] = [
    {
      subjectType: "everyone" as const,
      subjectId: null,
      roomId: null,
      allow: DEFAULT_EVERYONE_PERMISSIONS,
      deny: 0,
    },
  ];

  if (admin) {
    values.push({
      subjectType: "user",
      subjectId: admin.id,
      roomId: null,
      allow: Permission.ADMIN,
      deny: 0,
    });
  }

  await db.insert(permissions).values(values);
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
