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
      watching: string | null;
    }
  | {
      type: "action.voice.pause";
    };

export type VoiceEvent =
  | {
      type: "event.voice.joined";
      room: number;
      user: TalkingUser;
    }
  | {
      type: "event.voice.left";
      room: number;
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

export type UserAction = VoiceAction | RtcMessage; // tho rtc message is also an event, it is done like that to keep the type definition on the Gateway clean
export type ServerEvent = VoiceEvent | OtherEvent;

export type Message = UserAction | ServerEvent;
