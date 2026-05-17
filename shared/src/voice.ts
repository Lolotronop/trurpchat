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
