import type { Key, Room as RoomData, User } from "./db/schema";
export type { Room as RoomData, User } from "./db/schema";

type Flatten<T> = { [K in keyof T]: T[K] } & {};

export type ConnectedUserState = {
  muted: boolean;
  deafened: boolean;
  camera: boolean;
  streaming: boolean;
  watching: number | null;
  online: true;
};

export type ConnectedUser = User & ConnectedUserState;

export type VoiceChat = Flatten<
  RoomData & { type: "voice" } & {
    users: ConnectedUser[];
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
  | ({
      type: "action.voice.userstate";
    } & Partial<Omit<ConnectedUserState, "online">>)
  | {
      type: "action.voice.pause";
      userId: number;
    };

export type VoiceEvent =
  | {
      type: "event.voice.joined";
      room: number;
      user: ConnectedUser;
    }
  | {
      type: "event.voice.left";
      room: number;
      user: ConnectedUser;
    }
  | {
      type: "event.voice.userstate";
      room: number;
      user: ConnectedUser;
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
      type: "action.user.update";
      id: number;
    } & Partial<User>)
  | {
      type: "action.user.delete";
      id: number;
    };

export type UserEvent =
  | {
      type: "event.user.list";
      online: ConnectedUser[];
      offline: User[];
    }
  | {
      type: "event.user.me";
      user: User;
    };

export type RoomAction =
  | {
      type: "action.room.create";
      room: Omit<RoomData, "id">;
    }
  | {
      type: "action.room.delete";
      id: number;
    }
  | {
      type: "action.room.update";
      room: RoomData;
    };

export type RoomEvent =
  | {
      type: "event.room.list";
      rooms: Room[];
    }
  | {
      type: "event.room.update";
      room: Room;
    };

export type OtherEvent =
  | {
      type: "event.oven";
      ovenServerUrl: string;
    }
  | {
      type: "event.connected";
      user: User;
    };

// RtcMessage is kinda weird, it is both an event and an action
export type ClientAction =
  | VoiceAction
  | KeyAction
  | UserAction
  | RoomAction
  | RtcMessage;
export type ServerEvent =
  | VoiceEvent
  | KeyEvent
  | UserEvent
  | RtcMessage
  | RoomEvent
  | OtherEvent;

export type Message = ClientAction | ServerEvent;
