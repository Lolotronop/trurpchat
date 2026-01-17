import type { Room as RoomData, User } from "./db/schema";
export type { Room as RoomData, User } from "./db/schema";

type Flatten<T> = { [K in keyof T]: T[K] } & {};

export type TalkingUserState = {
  muted: boolean;
  deafened: boolean;
  streaming: boolean;
  watching: string | null;
};

export type TalkingUser = User & TalkingUserState;

export type VoiceChat = Flatten<
  RoomData & { type: "voice" } & {
    users: TalkingUser[];
  }
>;

export type Room = VoiceChat | Flatten<RoomData & { type: "text" }>;

type RtcMessage =
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

type VoiceAction =
  | {
      type: "action.voice.join";
      room: string;
    }
  | {
      type: "action.voice.leave";
      room: string;
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
      watching: string | null;
    }
  | {
      type: "action.voice.pause";
    };

export type VoiceEvent =
  | {
      type: "event.voice.joined";
      room: string;
      user: TalkingUser;
    }
  | {
      type: "event.voice.left";
      room: string;
      user: TalkingUser;
    };

export type OtherEvent =
  | {
      type: "event.rooms";
      rooms: Room[];
    }
  | {
      type: "event.connected";
      id: number;
    };

export type Action = VoiceAction;
export type ServerEvent = VoiceEvent | OtherEvent;

export type Message = Action | ServerEvent | RtcMessage;
