import type { Room, SharedState } from "trurpchat-shared";
import { getPlatformStore, type IPersistantStore } from "./webstore";

export type RoomNotificationMode = "muted" | "suppressed" | "normal";

export type RoomUserData = {
  notificationMode: RoomNotificationMode;
  colorHex: string | undefined;
};

export type ClientRoomData = {
  roomId: number;
} & RoomUserData;

export type TextRoom = Room & RoomUserData & { type: "text" };
export type VoiceRoom = Room &
  RoomUserData & { type: "voice"; users: number[] };
export type RoomWithData = TextRoom | VoiceRoom;

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
  data: ClientRoomData[] = $state([]);

  #serverId: string | undefined = $state(undefined);
  #loadVersion = 0;

  constructor(
    readonly state: SharedState,
    serverId?: string | null,
  ) {
    void this.setServerId(serverId ?? undefined);
  }

  #dataByRoomId = $derived.by(() => {
    return new Map(this.data.map((entry) => [entry.roomId, entry]));
  });

  #voiceUsersByRoomId = $derived.by(() => {
    const byRoomId = new Map<number, number[]>();
    for (const entry of this.state.voiceUsers) {
      const existing = byRoomId.get(entry.roomId);
      if (existing) {
        existing.push(entry.userId);
      } else {
        byRoomId.set(entry.roomId, [entry.userId]);
      }
    }
    return byRoomId;
  });

  list: RoomWithData[] = $derived.by(() => {
    return sortRooms(
      this.state.rooms.map((room) => {
        const base = {
          ...defaultRoomUserData,
          ...room,
          ...(this.#dataByRoomId.get(room.id) ?? {}),
        };

        if (room.type === "voice") {
          return {
            ...base,
            type: "voice" as const,
            users: this.#voiceUsersByRoomId.get(room.id) ?? [],
          };
        }

        return {
          ...base,
          type: "text" as const,
        };
      }),
    );
  });

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
    if (
      loadVersion !== this.#loadVersion ||
      this.#serverId !== normalizedServerId
    ) {
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
          notificationMode:
            value.notificationMode ?? defaultRoomUserData.notificationMode,
          colorHex: value.colorHex,
        },
      ];
    });
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

  setData(roomId: number, patch: Partial<RoomUserData>) {
    const existing = this.findData(roomId);
    const next: ClientRoomData = {
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

  async persistData(roomId: number, data: RoomUserData) {
    if (!this.#serverId) {
      return;
    }

    await this.store.set(toStorageKey(this.#serverId, roomId), data);
  }
}
