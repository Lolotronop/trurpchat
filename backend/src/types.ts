import type {
  Key,
  Message as MessageData,
  Room as RoomData,
  User as DbUser,
} from "./db/schema";

export type {
  User as DbUser,
  Room as RoomData,
  Message as TextMessage,
} from "./db/schema";

type Flatten<T> = { [K in keyof T]: T[K] } & {};

export type ConnectedUserState = {
  muted: boolean;
  deafened: boolean;
  camera: boolean;
  streaming: boolean;
  watching: number | null;
  online: true;
};

export type OfflineUser = DbUser & {
  online: false;
};

export type ConnectedUser = DbUser & ConnectedUserState;

export type User = OfflineUser | ConnectedUser;

export type VoiceChat = Flatten<
  RoomData & { type: "voice" } & {
    users: number[];
  }
>;

export type Room = VoiceChat | Flatten<RoomData & { type: "text" }>;

export type RtcMessage =
  | {
      type: "rtc.offer";
      // @ts-expect-error
      offer: RTCSessionDescriptionInit;
      sender: number;
      target: number;
    }
  | {
      type: "rtc.answer";
      // @ts-expect-error
      answer: RTCSessionDescriptionInit;
      sender: number;
      target: number;
    }
  | {
      type: "rtc.ice";
      // @ts-expect-error
      candidate: RTCIceCandidateInit;
      sender: number;
      target: number;
    };

export type VoiceAction =
  | {
      type: "action.voice.join";
      room: number;
    }
  | {
      type: "action.voice.leave";
      room: number;
    }
  | {
      type: "action.voice.pause";
      userId: number;
    };

export type VoiceEvent =
  | {
      type: "event.voice.joined";
      room: number;
      userId: number;
    }
  | {
      type: "event.voice.left";
      room: number;
      userId: number;
    }
  | {
      type: "event.voice.pause";
      fromUserId: number;
    };

export type KeyAction =
  | {
      type: "action.key.add";
      userId: number;
    }
  | {
      type: "action.key.remove";
      keyId: number;
    }
  | {
      type: "action.key.list";
    };

export type KeyEvent = {
  type: "event.key.list";
  keys: Key[];
};

export type UserAction =
  | {
      type: "action.user.create";
      name: string;
    }
  | ({
      type: "action.user.state";
    } & Partial<Omit<ConnectedUserState, "online">>)
  | ({
      type: "action.user.update";
      id: number;
    } & Partial<DbUser>)
  | {
      type: "action.user.delete";
      id: number;
    };

export type UserEvent =
  | {
      type: "event.user.list";
      users: User[];
    }
  | {
      type: "event.user.state";
      user: ConnectedUser;
    }
  | {
      type: "event.user.online";
      userId: number;
    }
  | {
      type: "event.user.offline";
      userId: number;
    }
  | {
      type: "event.user.created";
      user: OfflineUser;
    }
  | {
      type: "event.user.updated";
      user: DbUser;
    }
  | {
      type: "event.user.deleted";
      userId: number;
    }
  | {
      type: "event.user.me";
      user: User;
    };

export type RoomAction =
  | {
      type: "action.room.create";
      room: Omit<
        RoomData,
        "id" | "createdAt" | "deletedAt" | "nextMessageId" | "order"
      >;
    }
  | {
      type: "action.room.delete";
      id: number;
    }
  | {
      type: "action.room.update";
      room: Partial<RoomData> & Pick<RoomData, "id">;
    };

export type RoomEvent =
  | {
      type: "event.room.list";
      rooms: Room[];
    }
  | {
      type: "event.room.updated";
      room: Room;
    }
  | {
      type: "event.room.deleted";
      roomId: number;
    };

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
    };

export type MessageEvent =
  | {
      type: "event.message.created";
      message: MessageData;
    }
  | {
      type: "event.message.edited";
      message: MessageData;
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
      messages: MessageData[];
    };

export type OtherEvent =
  | {
      type: "event.oven";
      ovenServerUrl: string;
    }
  | {
      type: "event.connected";
      user: ConnectedUser;
    };

// RtcMessage is kinda weird, it is both an event and an action
export type ClientAction =
  | VoiceAction
  | KeyAction
  | UserAction
  | RoomAction
  | MessageAction
  | RtcMessage;
export type ServerEvent =
  | VoiceEvent
  | KeyEvent
  | UserEvent
  | RtcMessage
  | RoomEvent
  | MessageEvent
  | OtherEvent;

export type Message = ClientAction | ServerEvent;
