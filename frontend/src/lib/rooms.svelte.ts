import type { Room, VoiceChat } from "trurpchat-backend";
import { getPlatformStore, type IPersistantStore } from "./webstore";

export type RoomNotificationMode = "muted" | "suppressed" | "normal";

export type RoomUserData = {
  notificationMode: RoomNotificationMode;
  colorHex: string | undefined;
};

export type RoomData = {
  roomId: number;
} & RoomUserData;

export type RoomWithData = Room & RoomUserData;
export type VoiceRoom = VoiceChat & RoomUserData;
export type TextRoom = Extract<RoomWithData, { type: "text" }>;

const defaultRoomUserData: RoomUserData = {
  notificationMode: "normal",
  colorHex: undefined,
};

function sortRooms(rooms: RoomWithData[]) {
  return [...rooms].sort((a, b) => a.order - b.order);
}

function toStorageKey(serverId: string, roomId: number) {
  return `${serverId}-${roomId}`;
}

export class RoomStore {
  store: IPersistantStore = getPlatformStore("room-data");
  rawRooms: Room[] = $state([]);
  data: RoomData[] = $state([]);

  #serverId: string | undefined = $state(undefined);
  #loadVersion = 0;

  #dataByRoomId = $derived.by(() => {
    return new Map(this.data.map((entry) => [entry.roomId, entry]));
  });

  list: RoomWithData[] = $derived.by(() => {
    return sortRooms(
      this.rawRooms.map((room) => ({
        ...defaultRoomUserData,
        ...room,
        ...(this.#dataByRoomId.get(room.id) ?? {}),
      })),
    );
  });

  constructor(serverId?: string | null) {
    void this.setServerId(serverId ?? undefined);
  }

  async setServerId(serverId?: string | null) {
    const normalizedServerId = serverId ?? undefined;
    this.#serverId = normalizedServerId;
    this.data = [];

    if (!normalizedServerId) {
      return;
    }

    const loadVersion = ++this.#loadVersion;
    await this.store.reload();
    const entries = await this.store.entries<RoomUserData>();
    if (loadVersion !== this.#loadVersion || this.#serverId !== normalizedServerId) {
      return;
    }

    const prefix = `${normalizedServerId}-`;
    this.data = entries.flatMap(([key, value]) => {
      if (!key.startsWith(prefix)) {
        return [];
      }

      const roomId = Number(key.slice(prefix.length));
      if (!Number.isFinite(roomId)) {
        return [];
      }

      return [
        {
          roomId,
          notificationMode: value.notificationMode ?? defaultRoomUserData.notificationMode,
          colorHex: value.colorHex,
        },
      ];
    });
  }

  setRooms(rooms: Room[]) {
    this.rawRooms = rooms;
  }

  upsertRoom(room: Room) {
    const roomIndex = this.rawRooms.findIndex((existing) => existing.id === room.id);
    if (roomIndex === -1) {
      this.rawRooms.push(room);
      return;
    }

    const existingRoom = this.rawRooms[roomIndex];
    if (!existingRoom) {
      return;
    }

    this.rawRooms[roomIndex] = { ...existingRoom, ...room };
  }

  deleteRoom(roomId: number) {
    const roomIndex = this.rawRooms.findIndex((room) => room.id === roomId);
    if (roomIndex !== -1) {
      this.rawRooms.splice(roomIndex, 1);
    }
  }

  find(id: number) {
    return this.list.find((room) => room.id === id);
  }

  findData(roomId: number) {
    return this.data.find((entry) => entry.roomId === roomId);
  }

  findVoiceRoomByUserId(userId: number) {
    for (const room of this.list) {
      if (room.type === "voice" && room.users.includes(userId)) {
        return room;
      }
    }

    return undefined;
  }

  addUserToVoiceRoom(roomId: number, userId: number) {
    const room = this.find(roomId);
    if (!room || room.type !== "voice") {
      return undefined;
    }

    if (room.users.includes(userId)) {
      return room;
    }

    room.users.push(userId);
    return room;
  }

  removeUserFromVoiceRoom(roomId: number, userId: number) {
    const room = this.find(roomId);
    if (!room || room.type !== "voice") {
      return undefined;
    }

    const index = room.users.indexOf(userId);
    if (index === -1) {
      return room;
    }

    room.users.splice(index, 1);
    return room;
  }

  setNextMessageId(roomId: number, nextMessageId: number) {
    const room = this.find(roomId);
    if (!room || room.type !== "text") {
      return undefined;
    }

    room.nextMessageId = nextMessageId;
    return room;
  }

  setData(roomId: number, patch: Partial<RoomUserData>) {
    const existing = this.findData(roomId);
    const next: RoomData = {
      roomId,
      ...defaultRoomUserData,
      ...existing,
      ...patch,
    };

    if (
      next.notificationMode === defaultRoomUserData.notificationMode &&
      next.colorHex === defaultRoomUserData.colorHex
    ) {
      this.deleteData(roomId);
      return;
    }

    if (existing) {
      Object.assign(existing, next);
    } else {
      this.data.push(next);
    }

    void this.persistData(roomId, next);
  }

  deleteData(roomId: number) {
    const dataIndex = this.data.findIndex((entry) => entry.roomId === roomId);
    if (dataIndex !== -1) {
      this.data.splice(dataIndex, 1);
    }

    if (!this.#serverId) {
      return;
    }

    void this.store.delete(toStorageKey(this.#serverId, roomId));
  }

  async persistData(roomId: number, value: RoomUserData) {
    if (!this.#serverId) {
      return;
    }

    await this.store.set(toStorageKey(this.#serverId, roomId), value);
  }
}
