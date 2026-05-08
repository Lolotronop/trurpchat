export type ChannelType = "text" | "voice";

export type Room = {
  id: number;
  name: string;
  type: ChannelType;
  order: number;
  nextMessageId: number;
  deletedAt: Date | null;
};

export type RoomAction =
  | {
      type: "action.room.create";
      room: Omit<
        Room,
        "id" | "createdAt" | "deletedAt" | "nextMessageId" | "order"
      >;
    }
  | {
      type: "action.room.delete";
      id: number;
    }
  | {
      type: "action.room.update";
      room: Partial<Room> & Pick<Room, "id">;
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
