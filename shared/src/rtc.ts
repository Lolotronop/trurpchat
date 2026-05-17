type RtcSdpType = "answer" | "offer" | "pranswer" | "rollback";

export type RtcSessionDescriptionInit = {
  type: RtcSdpType;
  sdp?: string;
};

export type RtcIceCandidateInit = {
  candidate?: string;
  sdpMid?: string | null;
  sdpMLineIndex?: number | null;
  usernameFragment?: string | null;
};

export type RtcMessage =
  | {
      type: "rtc.offer";
      offer: RtcSessionDescriptionInit;
      sender: number;
      target: number;
    }
  | {
      type: "rtc.answer";
      answer: RtcSessionDescriptionInit;
      sender: number;
      target: number;
    }
  | {
      type: "rtc.ice";
      candidate: RtcIceCandidateInit;
      sender: number;
      target: number;
    };
