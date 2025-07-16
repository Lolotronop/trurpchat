export type User = {
  id: string;
  name: string;
  muted: boolean;
  deafened: boolean;
  streaming: boolean;
};

export type Room = {
  name: string;
  users: User[];
};

export type Message =
  | {
      type: "join";
      room: string;
    }
  | {
      type: "joined";
      room: string;
      user: User;
    }
  | {
      type: "leave";
      room: string;
    }
  | {
      type: "left";
      room: string;
      user: User;
    }
  | {
      type: "rtc.offer";
      offer: RTCSessionDescriptionInit;
      sender?: string;
      target?: string;
    }
  | {
      type: "rtc.answer";
      answer: RTCSessionDescriptionInit;
      sender?: string;
      target?: string;
    }
  | {
      type: "rtc.ice";
      candidate: RTCIceCandidateInit;
      sender?: string;
      target?: string;
    }
  | {
      type: "rooms";
      rooms: Room[];
    }
  | {
      type: "connected";
      id: string;
    }
  | {
      type: "muted";
      muted: boolean;
    }
  | {
      type: "streaming";
      streaming: boolean;
    }
  | {
      type: "deafened";
      deafened: boolean;
    };
