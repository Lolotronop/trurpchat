export type TypingAction = {
  type: "action.typing";
  roomId: number;
};

export type TypingEvent = {
  type: "event.typing";
  roomId: number;
  userId: number;
  timestamp: Date;
};
