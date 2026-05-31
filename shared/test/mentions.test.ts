import { describe, expect, test } from "bun:test";
import { mentions } from "$src/mentions";

describe("user mentions", () => {
  test("formats raw and display names", () => {
    expect(mentions.user.format.raw(123)).toBe("<@123>");
    expect(mentions.user.format.name({ id: 1, name: "alice", displayName: null, deletedAt: null })).toBe("@alice");
    expect(mentions.user.format.name({ id: 1, name: "alice", displayName: "Ali", deletedAt: null })).toBe("@Ali");
    expect(mentions.user.format.name(42)).toBe("@#42");
    expect(mentions.user.format.name(undefined)).toBe("@#unknown");
  });

  test("finds user mentions with raw text, ids, and indexes", () => {
    expect(mentions.user.get("hi <@12> and <@34>")).toEqual([
      { raw: "<@12>", userId: 12, index: 3 },
      { raw: "<@34>", userId: 34, index: 13 },
    ]);
  });

  test("detects and includes user mentions", () => {
    expect(mentions.user.has("hello <@5>")).toBe(true);
    expect(mentions.user.has("hello @5")).toBe(false);
    expect(mentions.user.includes("hello <@5>", 5)).toBe(true);
    expect(mentions.user.includes("hello <@55>", 5)).toBe(false);
  });

  test("splits text around user mentions", () => {
    expect(mentions.user.split("hi <@1> and <@2>")).toEqual([
      { type: "text", value: "hi " },
      { type: "mention", raw: "<@1>", userId: 1 },
      { type: "text", value: " and " },
      { type: "mention", raw: "<@2>", userId: 2 },
    ]);
  });
});

describe("role mentions", () => {
  test("formats raw and display names", () => {
    expect(mentions.role.format.raw(123)).toBe("<@&123>");
    expect(mentions.role.format.name({ id: 1, name: "mods", color: 0, section: false, order: 0 })).toBe("@mods");
    expect(mentions.role.format.name(42)).toBe("@&42");
    expect(mentions.role.format.name(undefined)).toBe("@&unknown");
  });

  test("finds role mentions with raw text, ids, and indexes", () => {
    expect(mentions.role.get("hi <@&12> and <@&34>")).toEqual([
      { raw: "<@&12>", roleId: 12, index: 3 },
      { raw: "<@&34>", roleId: 34, index: 14 },
    ]);
  });

  test("detects and includes role mentions", () => {
    expect(mentions.role.has("hello <@&5>")).toBe(true);
    expect(mentions.role.has("hello <@5>")).toBe(false);
    expect(mentions.role.includes("hello <@&5>", 5)).toBe(true);
    expect(mentions.role.includes("hello <@&55>", 5)).toBe(false);
  });

  test("splits text around role mentions", () => {
    expect(mentions.role.split("hi <@&1> and <@&2>")).toEqual([
      { type: "text", value: "hi " },
      { type: "mention", raw: "<@&1>", roleId: 1 },
      { type: "text", value: " and " },
      { type: "mention", raw: "<@&2>", roleId: 2 },
    ]);
  });
});

describe("mixed mentions", () => {
  test("detects either user or role mentions", () => {
    expect(mentions.has("hello")).toBe(false);
    expect(mentions.has("hello <@1>")).toBe(true);
    expect(mentions.has("hello <@&1>")).toBe(true);
  });

  test("splits mixed mentions in text order", () => {
    expect(mentions.split("<@2> hi <@&1>!")).toEqual([
      { type: "user", raw: "<@2>", userId: 2 },
      { type: "text", value: " hi " },
      { type: "role", raw: "<@&1>", roleId: 1 },
      { type: "text", value: "!" },
    ]);
  });

  test("returns one text part for strings without mentions", () => {
    expect(mentions.split("plain text")).toEqual([{ type: "text", value: "plain text" }]);
    expect(mentions.user.split("plain text")).toEqual([{ type: "text", value: "plain text" }]);
    expect(mentions.role.split("plain text")).toEqual([{ type: "text", value: "plain text" }]);
  });

  test("keeps partial and malformed mentions as text", () => {
    expect(mentions.split("<@> <@abc> <@&> <@&abc>")).toEqual([
      { type: "text", value: "<@> <@abc> <@&> <@&abc>" },
    ]);
  });

  test("handles adjacent mentions", () => {
    expect(mentions.split("<@1><@&2><@3>")).toEqual([
      { type: "user", raw: "<@1>", userId: 1 },
      { type: "role", raw: "<@&2>", roleId: 2 },
      { type: "user", raw: "<@3>", userId: 3 },
    ]);
  });
});

describe("mention trigger", () => {
  test("matches an @query at the end of text", () => {
    expect(mentions.trigger("hello @ali")).toEqual({
      query: "ali",
      replaceStart: 6,
      replaceEnd: 10,
    });
  });

  test("matches an empty query after @", () => {
    expect(mentions.trigger("hello @")).toEqual({
      query: "",
      replaceStart: 6,
      replaceEnd: 7,
    });
  });

  test("allows punctuation before the trigger", () => {
    expect(mentions.trigger("hello (@bob")).toEqual({
      query: "bob",
      replaceStart: 7,
      replaceEnd: 11,
    });
  });

  test("does not match when trigger is not at the end", () => {
    expect(mentions.trigger("hello @ali there")).toBeNull();
  });

  test("does not match inside existing mention syntax or email-like text", () => {
    expect(mentions.trigger("hello <@1>")).toBeNull();
    expect(mentions.trigger("mail a@b")).toBeNull();
  });
});
