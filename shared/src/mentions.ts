export const USER_MENTION_REGEX = /<@(\d+)>/g;
export const USER_MENTION_TRIGGER_REGEX = /(?:^|[\s([{:;,.!?-])@([^\s@<>]*)$/;

export type UserMentionMatch = {
  raw: string;
  userId: number;
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

const user = {
  regex: USER_MENTION_REGEX,
  format(userId: number | string) {
    return `<@${userId}>`;
  },
  get(text: string): UserMentionMatch[] {
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
  },
  has(text: string) {
    return user.get(text).length > 0;
  },
  includes(text: string, userId: number) {
    return text.includes(user.format(userId));
  },
  split(text: string): UserMentionPart[] {
    const parts: UserMentionPart[] = [];
    let lastIndex = 0;

    for (const mention of user.get(text)) {
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
  },
} as const;

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
  user,
} as const;
