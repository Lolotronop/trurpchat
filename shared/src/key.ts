export type Key = {
  id: number;
  key: string;
  userId: number;
  createdAt: Date;
  lastSeen: Date;
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
