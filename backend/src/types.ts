import type { Room as RoomData, User } from "./db/schema";
export type { Room as RoomData, User } from "./db/schema";

type Flatten<T> = { [K in keyof T]: T[K] } & {};

export type ConnectedUserState = {
  muted: boolean;
  deafened: boolean;
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
      sender?: number;
      target?: number;
    }
  | {
      type: "rtc.answer";
      // @ts-expect-error
      answer: RTCSessionDescriptionInit;
      sender?: number;
      target?: number;
    }
  | {
      type: "rtc.ice";
      // @ts-expect-error
      candidate: RTCIceCandidateInit;
      sender?: number;
      target?: number;
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
      type: "action.voice.mute";
      muted: boolean;
    }
  | {
      type: "action.voice.stream";
      streaming: boolean;
    }
  | {
      type: "action.voice.deafen";
      deafened: boolean;
    }
  | {
      type: "action.voice.watch";
      watching: number | null;
    }
  | {
      type: "action.voice.pause";
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
    };

export type OtherEvent =
  | {
      type: "event.oven";
      ovenServerUrl: string;
    }
  | {
      type: "event.users";
      online: ConnectedUser[];
      offline: User[];
    }
  | {
      type: "event.rooms";
      rooms: Room[];
    }
  | {
      type: "event.connected";
      user: User;
    };

export type UserAction = VoiceAction | RtcMessage; // tho rtc message is also an event, it is done like that to keep the type definition on the Gateway clean
export type ServerEvent = VoiceEvent | OtherEvent;

export type Message = UserAction | ServerEvent;
