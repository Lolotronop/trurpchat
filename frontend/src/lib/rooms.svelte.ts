import type { Room, VoiceChat } from "trurpchat-backend";

function sortRooms(rooms: Room[]) {
  return [...rooms].sort((a, b) => a.order - b.order);
}

export class RoomStore {
  rawRooms: Room[] = $state([]);

  list: Room[] = $derived.by(() => {
    return sortRooms(this.rawRooms);
  });

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
}

export type VoiceRoom = VoiceChat;
