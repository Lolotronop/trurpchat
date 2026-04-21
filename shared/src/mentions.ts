import type { Role, User } from "trurpchat-backend";

export const USER_MENTION_REGEX = /<@(\d+)>/g;
export const ROLE_MENTION_REGEX = /<@&(\d+)>/g;
export const USER_MENTION_TRIGGER_REGEX = /(?:^|[\s([{:;,.!?-])@([^\s@<>]*)$/;

export type UserMentionMatch = {
  raw: string;
  userId: number;
  index: number;
};

export type RoleMentionMatch = {
  raw: string;
  roleId: number;
  index: number;
};

export type UserMentionPart =
  | {
      type: "text";
      value: string;
    }
  | {
      type: "mention";
      raw: string;
      userId: number;
    };

export type RoleMentionPart =
  | {
      type: "text";
      value: string;
    }
  | {
      type: "mention";
      raw: string;
      roleId: number;
    };

export type MentionPart =
  | {
      type: "text";
      value: string;
    }
  | {
      type: "user";
      raw: string;
      userId: number;
    }
  | {
      type: "role";
      raw: string;
      roleId: number;
    };

function getUserMentions(text: string): UserMentionMatch[] {
  const matches: UserMentionMatch[] = [];

  for (const match of text.matchAll(USER_MENTION_REGEX)) {
    const raw = match[0];
    const userId = Number(match[1]);
    const index = match.index ?? 0;

    if (!Number.isFinite(userId)) {
      continue;
    }

    matches.push({ raw, userId, index });
  }

  return matches;
}

function getRoleMentions(text: string): RoleMentionMatch[] {
  const matches: RoleMentionMatch[] = [];

  for (const match of text.matchAll(ROLE_MENTION_REGEX)) {
    const raw = match[0];
    const roleId = Number(match[1]);
    const index = match.index ?? 0;

    if (!Number.isFinite(roleId)) {
      continue;
    }

    matches.push({ raw, roleId, index });
  }

  return matches;
}

function splitUserMentions(text: string): UserMentionPart[] {
  const parts: UserMentionPart[] = [];
  let lastIndex = 0;

  for (const mention of getUserMentions(text)) {
    if (mention.index > lastIndex) {
      parts.push({
        type: "text",
        value: text.slice(lastIndex, mention.index),
      });
    }

    parts.push({
      type: "mention",
      raw: mention.raw,
      userId: mention.userId,
    });
    lastIndex = mention.index + mention.raw.length;
  }

  if (lastIndex < text.length || parts.length === 0) {
    parts.push({
      type: "text",
      value: text.slice(lastIndex),
    });
  }

  return parts;
}

function splitRoleMentions(text: string): RoleMentionPart[] {
  const parts: RoleMentionPart[] = [];
  let lastIndex = 0;

  for (const mention of getRoleMentions(text)) {
    if (mention.index > lastIndex) {
      parts.push({
        type: "text",
        value: text.slice(lastIndex, mention.index),
      });
    }

    parts.push({
      type: "mention",
      raw: mention.raw,
      roleId: mention.roleId,
    });
    lastIndex = mention.index + mention.raw.length;
  }

  if (lastIndex < text.length || parts.length === 0) {
    parts.push({
      type: "text",
      value: text.slice(lastIndex),
    });
  }

  return parts;
}

const user = {
  regex: USER_MENTION_REGEX,
  format: {
    raw(userId: number | string) {
      return `<@${userId}>`;
    },
    name(user: User | number | undefined) {
      if (typeof user === "number") {
        return `@#${user}`;
      }
      if (user) {
        const name = user.displayName ?? user.name;
        return `@${name}`;
      }

      return "@#unknown";
    },
  },
  get(text: string): UserMentionMatch[] {
    return getUserMentions(text);
  },
  has(text: string) {
    return getUserMentions(text).length > 0;
  },
  includes(text: string, userId: number) {
    return text.includes(user.format.raw(userId));
  },
  split(text: string): UserMentionPart[] {
    return splitUserMentions(text);
  },
} as const;

const role = {
  regex: ROLE_MENTION_REGEX,
  format: {
    raw(roleId: number | string) {
      return `<@&${roleId}>`;
    },
    name(role: Role | number | undefined) {
      if (typeof role === "number") {
        return `@&${role}`;
      }
      if (role) {
        return `@${role.name}`;
      }

      return "@&unknown";
    },
  },
  get(text: string): RoleMentionMatch[] {
    return getRoleMentions(text);
  },
  has(text: string) {
    return getRoleMentions(text).length > 0;
  },
  includes(text: string, roleId: number) {
    return text.includes(role.format.raw(roleId));
  },
  split(text: string): RoleMentionPart[] {
    return splitRoleMentions(text);
  },
} as const;

function splitMentions(text: string): MentionPart[] {
  const parts: MentionPart[] = [];
  const allMentions = [
    ...getUserMentions(text).map((mention) => ({
      ...mention,
      type: "user" as const,
    })),
    ...getRoleMentions(text).map((mention) => ({
      ...mention,
      type: "role" as const,
    })),
  ].sort((a, b) => a.index - b.index);

  let lastIndex = 0;

  for (const mention of allMentions) {
    if (mention.index > lastIndex) {
      parts.push({
        type: "text",
        value: text.slice(lastIndex, mention.index),
      });
    }

    if (mention.type === "user") {
      parts.push({
        type: "user",
        raw: mention.raw,
        userId: mention.userId,
      });
    } else {
      parts.push({
        type: "role",
        raw: mention.raw,
        roleId: mention.roleId,
      });
    }

    lastIndex = mention.index + mention.raw.length;
  }

  if (lastIndex < text.length || parts.length === 0) {
    parts.push({
      type: "text",
      value: text.slice(lastIndex),
    });
  }

  return parts;
}

export type UserMentionTriggerMatch = {
  query: string;
  replaceStart: number;
  replaceEnd: number;
};

export const mentions = {
  trigger(textBeforeCaret: string): UserMentionTriggerMatch | null {
    const match = textBeforeCaret.match(USER_MENTION_TRIGGER_REGEX);
    if (!match) {
      return null;
    }

    const query = match[1] ?? "";
    const replaceEnd = textBeforeCaret.length;
    const replaceStart = replaceEnd - query.length - 1;

    return {
      query,
      replaceStart,
      replaceEnd,
    };
  },
  has(text: string) {
    return user.has(text) || role.has(text);
  },
  split(text: string): MentionPart[] {
    return splitMentions(text);
  },
  user,
  role,
} as const;
