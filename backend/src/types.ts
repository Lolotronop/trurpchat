import type {
  User as DbUser,
  Key,
  Message as MessageData,
  Role as DbRole,
  Room as RoomData,
  UnreadRow,
  UserRole as DbUserRole,
} from "./db/schema";

export type {
  Key,
  Message as TextMessage,
  Role as DbRole,
  Room as RoomData,
  User as DbUser,
  UserRole as DbUserRole,
} from "./db/schema";

type Flatten<T> = { [K in keyof T]: T[K] } & {};

type Select<T, K extends keyof T> = Pick<T, K>;

export type ConnectedUserState = {
  muted: boolean;
  deafened: boolean;
  camera: boolean;
  streaming: boolean;
  watchedBy: number[];
  online: true;
};

export type Unread = Flatten<UnreadRow & { mentiones: number }>;

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

export type IceServerConfig = {
  urls: string | string[];
  username?: string;
  credential?: string;
};

export type IceConfig = {
  iceServers: IceServerConfig[];
};

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
      type: "action.voice.watch";
      userId: number;
    }
  | {
      type: "action.voice.unwatch";
      userId: number;
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

export type Role = Select<
  DbRole,
  "id" | "name" | "color" | "permissions" | "order"
>;
export type UserRole = Select<DbUserRole, "userId" | "roleId">;

export type RoleCreate = Select<DbRole, "name" | "color" | "permissions"> &
  Partial<Select<DbRole, "order">>;

export type RoleUpdate = Select<DbRole, "id"> &
  Partial<Select<DbRole, "name" | "color" | "permissions" | "order">>;

export type RoleAction =
  | {
      type: "action.role.list";
    }
  | {
      type: "action.role.create";
      role: RoleCreate;
    }
  | {
      type: "action.role.update";
      role: RoleUpdate;
    }
  | {
      type: "action.role.delete";
      id: Role["id"];
    }
  | {
      type: "action.role.assign";
      userId: UserRole["userId"];
      roleId: UserRole["roleId"];
    }
  | {
      type: "action.role.unassign";
      userId: UserRole["userId"];
      roleId: UserRole["roleId"];
    };

export type RoleEvent =
  | {
      type: "event.role.list";
      roles: Role[];
      assignments: UserRole[];
    }
  | {
      type: "event.role.created";
      role: Role;
    }
  | {
      type: "event.role.updated";
      role: Role;
    }
  | {
      type: "event.role.deleted";
      roleId: Role["id"];
    }
  | {
      type: "event.role.assigned";
      userId: UserRole["userId"];
      roleId: UserRole["roleId"];
    }
  | {
      type: "event.role.unassigned";
      userId: UserRole["userId"];
      roleId: UserRole["roleId"];
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
    }
  | {
      type: "action.message.unread";
      roomId: number;
      unreadId: number;
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
    }
  | {
      type: "event.message.unread.list";
      unread: Unread[];
    };

export type OtherEvent =
  | {
      type: "event.startup.config";
      serverId: string;
      ovenServerUrl?: string;
      iceConfig: IceConfig;
    }
  | {
      type: "event.connected";
      user: ConnectedUser;
    };

// RtcMessage is kinda weird, it is both an event and an action
export type ClientAction =
  | VoiceAction
  | KeyAction
  | RoleAction
  | UserAction
  | RoomAction
  | MessageAction
  | RtcMessage;
export type ServerEvent =
  | VoiceEvent
  | KeyEvent
  | RoleEvent
  | UserEvent
  | RtcMessage
  | RoomEvent
  | MessageEvent
  | OtherEvent;

export type Message = ClientAction | ServerEvent;
