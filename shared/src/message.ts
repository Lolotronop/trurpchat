import type { Flatten } from "./utils";

export type AttachmentData =
  | {
      type: "image" | "video";
      path: string;
      width: number;
      height: number;
    }
  | {
      type: "audio";
      duration: number;
    }
  | {
      type: "file";
      mimeType: string;
    };

export type Attachment = {
  data: AttachmentData;
  name: string;
  path: string;
  size: number;
};

export type TextMessage = {
  id: number;
  roomId: number;
  userId: number;
  text: string;
  attachments: Attachment[] | null;
  replyTo: number | null;
  createdAt: Date;
  editedAt: Date | null;
  edited: boolean;
  deletedAt: Date | null;
  hasMention: boolean;
};

export type UnreadRow = {
  roomId: number;
  userId: number;
  unreadId: number;
};

export type Unread = Flatten<UnreadRow & { mentiones: number }>;

export type MessageAction =
  | {
      type: "action.message.create";
      roomId: number;
      text: string;
      replyTo?: number;
    }
  | {
      type: "action.message.edit";
      roomId: number;
      id: number;
      text: string;
    }
  | {
      type: "action.message.delete";
      roomId: number;
      id: number;
    }
  | {
      type: "action.message.list";
      roomId: number;
      fromId: number;
      /** Non-inclusive */
      toId: number;
    }
  | {
      type: "action.message.unread";
      roomId: number;
      unreadId: number;
    };

export type MessageEvent =
  | {
      type: "event.message.created";
      message: TextMessage;
    }
  | {
      type: "event.message.edited";
      message: TextMessage;
    }
  | {
      type: "event.message.deleted";
      roomId: number;
      id: number;
    }
  | {
      type: "event.message.list";
      roomId: number;
      fromId: number;
      toId: number;
      messages: TextMessage[];
    }
  | {
      type: "event.message.unread.list";
      unread: Unread[];
    };
