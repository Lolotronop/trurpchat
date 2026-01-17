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

type VoiceRequest =
  | {
      type: "join";
      room: string;
    }
  | {
      type: "leave";
      room: string;
    }
  | {
      type: "mute";
      muted: boolean;
    }
  | {
      type: "stream";
      streaming: boolean;
    }
  | {
      type: "deafen";
      deafened: boolean;
    }
  | {
      type: "watch";
      watching: string | null;
    }
  | {
      type: "pause";
    };

export type VoiceResponse =
  | {
      type: "joined";
      room: string;
      user: TalkingUser;
    }
  | {
      type: "left";
      room: string;
      user: TalkingUser;
    }
  | {
      type: "rooms";
      rooms: Room[];
    }
  | {
      type: "connected";
      id: number;
    };

export type Message = VoiceRequest | VoiceResponse | RtcMessage;
