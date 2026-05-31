import { describe, expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import { messages, rooms, unread } from "$src/db";
import { messageHandlers } from "$src/handler/message";
import { createSeededContext, lastSent } from "./helpers";

describe("message handlers", () => {
  test("action.message.create creates and broadcasts a message", async () => {
    const { ctx, alice } = await createSeededContext();

    const result = await messageHandlers["action.message.create"](ctx, alice, {
      type: "action.message.create",
      roomId: 10,
      text: "hello <@1>",
    });
    const dbMessages = await ctx.db.select().from(messages).where(eq(messages.roomId, 10));

    expect(result.isOk()).toBe(true);
    expect(dbMessages).toHaveLength(1);
    expect(dbMessages[0]?.hasMention).toBe(true);
    expect(ctx.state.rooms.find((room) => room.id === 10)?.nextMessageId).toBe(1);
  });

  test("action.message.create rejects voice rooms", async () => {
    const { ctx, alice } = await createSeededContext();

    const result = await messageHandlers["action.message.create"](ctx, alice, {
      type: "action.message.create",
      roomId: 20,
      text: "voice rooms should not store text messages",
    });
    const dbMessages = await ctx.db
      .select()
      .from(messages)
      .where(eq(messages.roomId, 20));

    expect(result.isErr()).toBe(true);
    expect(dbMessages).toHaveLength(0);
  });

  test("action.message.create rejects replies to missing messages", async () => {
    const { ctx, alice } = await createSeededContext();

    const result = await messageHandlers["action.message.create"](ctx, alice, {
      type: "action.message.create",
      roomId: 10,
      text: "replying to nothing",
      replyTo: 123,
    });
    const dbMessages = await ctx.db
      .select()
      .from(messages)
      .where(eq(messages.roomId, 10));

    expect(result.isErr()).toBe(true);
    expect(dbMessages).toHaveLength(0);
  });

  test("action.message.edit edits own message", async () => {
    const { ctx, alice } = await createSeededContext();
    await ctx.db.update(rooms).set({ nextMessageId: 1 }).where(eq(rooms.id, 10));
    await ctx.db.insert(messages).values({ id: 0, roomId: 10, userId: 2, text: "old" });

    const result = await messageHandlers["action.message.edit"](ctx, alice, {
      type: "action.message.edit",
      roomId: 10,
      id: 0,
      text: "new",
    });
    const [edited] = await ctx.db.select().from(messages).where(eq(messages.id, 0));

    expect(result.isOk()).toBe(true);
    expect(edited?.text).toBe("new");
    expect(edited?.edited).toBe(true);
  });

  test("action.message.delete deletes own message", async () => {
    const { ctx, alice } = await createSeededContext();
    await ctx.db.update(rooms).set({ nextMessageId: 1 }).where(eq(rooms.id, 10));
    await ctx.db.insert(messages).values({ id: 0, roomId: 10, userId: 2, text: "hello" });

    const result = await messageHandlers["action.message.delete"](ctx, alice, {
      type: "action.message.delete",
      roomId: 10,
      id: 0,
    });
    const [deleted] = await ctx.db.select().from(messages).where(eq(messages.id, 0));

    expect(result.isOk()).toBe(true);
    expect(deleted?.deletedAt).toBeInstanceOf(Date);
  });

  test("action.message.list sends a range and masks deleted messages", async () => {
    const { ctx, alice } = await createSeededContext();
    await ctx.db.update(rooms).set({ nextMessageId: 2 }).where(eq(rooms.id, 10));
    await ctx.db.insert(messages).values([
      { id: 0, roomId: 10, userId: 2, text: "visible" },
      { id: 1, roomId: 10, userId: 2, text: "deleted", deletedAt: new Date() },
    ]);

    const result = await messageHandlers["action.message.list"](ctx, alice, {
      type: "action.message.list",
      roomId: 10,
      fromId: 0,
      toId: 2,
    });

    expect(result.isOk()).toBe(true);
    const event = lastSent<{ type: "event.message.list"; messages: Array<{ text: string; attachments: unknown; replyTo: unknown }> }>(alice);
    expect(event.type).toBe("event.message.list");
    expect(event.messages.map((message) => message.text)).toEqual(["visible", ""]);
  });

  test("action.message.unread upserts unread marker", async () => {
    const { ctx, alice } = await createSeededContext();
    await ctx.db.update(rooms).set({ nextMessageId: 5 }).where(eq(rooms.id, 10));

    const first = await messageHandlers["action.message.unread"](ctx, alice, {
      type: "action.message.unread",
      roomId: 10,
      unreadId: 3,
    });
    const second = await messageHandlers["action.message.unread"](ctx, alice, {
      type: "action.message.unread",
      roomId: 10,
      unreadId: 4,
    });
    const rows = await ctx.db.select().from(unread).where(eq(unread.userId, 2));

    expect(first.isOk()).toBe(true);
    expect(second.isOk()).toBe(true);
    expect(rows).toMatchObject([{ roomId: 10, userId: 2, unreadId: 4 }]);
  });
});
