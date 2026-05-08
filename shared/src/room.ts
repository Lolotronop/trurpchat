import type { Flatten } from "./utils";

export type ChannelType = "text" | "voice";

export type RoomData = {
  id: number;
  name: string;
  type: ChannelType;
  order: number;
  nextMessageId: number;
  deletedAt: Date | null;
};

export type VoiceChat = Flatten<
  RoomData & { type: "voice" } & {
    users: number[];
  }
>;

export type Room = VoiceChat | Flatten<RoomData & { type: "text" }>;

export type RoomAction =
  | {
      type: "action.room.create";
      room: Omit<
        RoomData,
        "id" | "createdAt" | "deletedAt" | "nextMessageId" | "order"
      >;
    }
  | {
      type: "action.room.delete";
      id: number;
    }
  | {
      type: "action.room.update";
      room: Partial<RoomData> & Pick<RoomData, "id">;
    };

export type RoomEvent =
  | {
      type: "event.room.list";
      rooms: Room[];
    }
  | {
      type: "event.room.updated";
      room: Room;
    }
  | {
      type: "event.room.deleted";
      roomId: number;
    };
