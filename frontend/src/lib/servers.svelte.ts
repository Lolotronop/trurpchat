import { invoke, isTauri } from "@tauri-apps/api/core";
import type {
  ConnectedUserState,
  DbUser,
  IceConfig,
  Message,
  OfflineUser,
  Room,
  User,
  Key,
} from "trurpchat-backend";
import { Gateway } from "./gateway.svelte";
import { gitGud } from "./god.svelte";
import { BLOCK_SIZE, TextMessageCache, UnreadThing } from "./messages.svelte";
import { sound } from "./sound.svelte";
import { WebRTC } from "./webrtc.svelte";
import { getPlatformStore, type IPersistantStore } from "./webstore";

export type ServerDefinition = {
  id: string | null;
  name: string;
  url: string;
};

function createDefaultConnectedUserState(): ConnectedUserState {
  return {
    muted: false,
    deafened: false,
    camera: false,
    streaming: false,
    watchedBy: [],
    online: true,
  };
}

function patchUser(base: User, patch: DbUser): User {
  if (!base.online) {
    return toOfflineUser(patch);
  }

  return {
    ...base,
    ...patch,
    online: true,
  };
}

function toOfflineUser(user: DbUser): OfflineUser {
  return {
    ...user,
    online: false,
  };
}

function findAddedIds(previous: number[], next: number[]) {
  return next.filter((id) => !previous.includes(id));
}

function findRemovedIds(previous: number[], next: number[]) {
  return previous.filter((id) => !next.includes(id));
}

export class Server {
  definition: ServerDefinition = $state({
    id: null,
    name: "",
    url: "",
  });
  #persistDefinition: () => void | Promise<void>;
  /**
   * expeceted to be in format "http(s)://domain:port/"
   * trailing slash is MANDATORY(no it isnt its just funny to think it is)
   */
  overServerUrl: string | undefined = $state(undefined);
  iceConfig: IceConfig | undefined = $state(undefined);
  gateway: Gateway;
  rooms: Room[] = $state([]);
  rtc: WebRTC;
  user: User = $state({
    id: -1,
    name: "T",
    type: "text",
    permissions: 0,
    deletedAt: null,
    online: false,
  });

  users: User[] = $state([]);
  keys: Key[] = $state([]);
  unread: UnreadThing = new UnreadThing(this.user.id, (roomId, messageId) => {
    this.gateway.send({
      type: "action.message.unread",
      roomId,
      unreadId: messageId,
    });
  });

  messages: TextMessageCache = new TextMessageCache(
    (roomId: number) => {
      const room = this.findRoom(roomId);
      if (!room) return;
      if (room.type !== "text") return;
      return room;
    },

    (roomId, blockId) => {
      const room = this.findRoom(roomId);
      if (!room) return;
      if (room.type !== "text") return;
      if (blockId > room.nextMessageId - 1) {
        console.error(
          `onfetchrequest: blockId ${blockId} is greater than nextMessageId ${room.nextMessageId}`,
        );
        return;
      }
      this.gateway.send({
        type: "action.message.list",
        roomId: roomId,
        fromId: blockId,
        toId: blockId + BLOCK_SIZE,
      });
    },
  );

  constructor(
    definition: ServerDefinition,
    persistDefinition: () => void | Promise<void>,
  ) {
    this.definition = definition;
    this.#persistDefinition = persistDefinition;
    this.gateway = new Gateway();
    this.rtc = new WebRTC(
      gitGud().mic,
      gitGud().headphones,
      gitGud().camera,
      this,
    );
    this.gateway.onmessage((msg) => {
      this.handleMessage(msg);
      this.rtc.handleSignalingMessage(msg);
    });
    this.gateway.onclose(() => {
      this.overServerUrl = undefined;
      this.iceConfig = undefined;
      this.leaveRoom(false);
    });
    this.gateway.onopen(() => {
      this.gateway.send({
        type: "action.user.state",
        muted: gitGud().mic.muted,
      });
    });
  }

  handleMessage(message: Message) {
    if (message.type === "event.room.list") {
      message.rooms.sort((a, b) => a.order - b.order);
      this.rooms = message.rooms;
    } else if (message.type === "event.room.updated") {
      const roomIndex = this.rooms.findIndex((r) => r.id === message.room.id);
      if (roomIndex === -1) {
        this.rooms.push(message.room);
        this.rooms.sort((a, b) => a.order - b.order);
      } else {
        const room = this.rooms[roomIndex];
        this.rooms[roomIndex] = { ...room, ...message.room };
      }
      this.rooms.sort((a, b) => a.order - b.order);
    } else if (message.type === "event.room.deleted") {
      const roomIndex = this.rooms.findIndex((r) => r.id === message.roomId);
      if (roomIndex === -1) {
        console.error(
          `event.room.deleted: room ${message.roomId} not found in rooms`,
        );
        return;
      }

      if (this.rtc.room?.id === message.roomId) {
        this.leaveRoom();
      }

      this.rooms.splice(roomIndex, 1);
    } else if (message.type === "event.connected") {
      this.user = message.user;
    } else if (message.type === "event.user.list") {
      this.users = message.users;
    } else if (message.type === "event.user.online") {
      const userIndex = this.users.findIndex(
        (user) => user.id === message.userId,
      );
      if (userIndex === -1) {
        return;
      }

      const user = this.users[userIndex];
      if (user.online) {
        return;
      }

      this.users[userIndex] = {
        ...user,
        ...createDefaultConnectedUserState(),
      };
    } else if (message.type === "event.user.offline") {
      const userIndex = this.users.findIndex(
        (user) => user.id === message.userId,
      );
      if (userIndex === -1) {
        return;
      }

      const user = this.users[userIndex];
      if (!user.online) {
        return;
      }

      this.users[userIndex] = toOfflineUser(user);
    } else if (message.type === "event.user.created") {
      const userIndex = this.users.findIndex(
        (user) => user.id === message.user.id,
      );
      if (userIndex === -1) {
        this.users.push(message.user);
      } else {
        this.users[userIndex] = message.user;
      }
    } else if (message.type === "event.user.updated") {
      const userIndex = this.users.findIndex(
        (user) => user.id === message.user.id,
      );
      if (userIndex === -1) {
        this.users.push(toOfflineUser(message.user));
      } else {
        const user = this.users[userIndex];
        if (!user) {
          console.error("user not found", userIndex, message.user.id);
          return;
        }
        this.users[userIndex] = patchUser(user, message.user);
      }
    } else if (message.type === "event.user.deleted") {
      const userIndex = this.users.findIndex(
        (user) => user.id === message.userId,
      );
      if (userIndex === -1) {
        return;
      }
      this.users.splice(userIndex, 1);
    } else if (message.type === "event.user.state") {
      const userIndex = this.users.findIndex(
        (user) => user.id === message.user.id,
      );
      if (userIndex === -1) {
        this.users.push(message.user);
      } else {
        const previousUser = this.users[userIndex]!;
        this.users[userIndex] = message.user;
        this.handleUserStateSound(previousUser, message.user);
      }
    } else if (message.type === "event.startup.config") {
      if (this.definition.id === null) {
        this.definition.id = message.serverId;
        void this.#persistDefinition();
      } else if (this.definition.id !== message.serverId) {
        console.warn(
          `Server id mismatch for ${this.definition.name}: expected ${this.definition.id}, got ${message.serverId}`,
        );
        this.definition.id = message.serverId;
        void this.#persistDefinition();
      }
      this.overServerUrl = message.ovenServerUrl;
      this.iceConfig = message.iceConfig;
    } else if (message.type === "event.key.list") {
      this.keys = message.keys;
    } else if (message.type === "event.user.me") {
      this.user = message.user;
    } else if (message.type === "event.voice.joined") {
      const room = this.findRoom(message.room);
      if (!room || room.type !== "voice") {
        return;
      }
      const has = room.users.includes(message.userId);
      if (has) {
        return;
      }
      room.users.push(message.userId);
    } else if (message.type === "event.voice.left") {
      const room = this.findRoom(message.room);
      if (!room || room.type !== "voice") {
        return;
      }

      const index = room.users.indexOf(message.userId);
      if (index === -1) {
        console.error(
          `event.voice.left: user ${message.userId} not found in room ${message.room}`,
        );
        return;
      }
      room.users.splice(index, 1);

      const isMe = message.userId === this.user.id;
      const inRoom = this.rtc.room?.id === room.id;
      if (isMe && inRoom) {
        this.leaveRoom(false);
      }
    } else if (message.type === "event.message.list") {
      this.messages.set(message.roomId, message.fromId, message.messages);
    } else if (message.type === "event.message.edited") {
      this.messages.edit(message.message);
    } else if (message.type === "event.message.deleted") {
      this.messages.delete(message.roomId, message.id);
    } else if (message.type === "event.message.created") {
      const room = this.findRoom(message.message.roomId);
      if (room) room.nextMessageId = message.message.id + 1;
      this.messages.append(message.message);
    } else if (message.type === "event.message.unread.list") {
      this.unread.unread = message.unread;
    }
  }

  reconnect() {
    this.overServerUrl = undefined;
    this.iceConfig = undefined;
    this.gateway.disconnect();
    this.gateway.connect(this.definition.url);
  }

  get connected() {
    return this.gateway.connected;
  }

  findUser(id: number) {
    const user = this.users.find((u) => u.id === id);
    return user;
  }

  findRoom(id: number) {
    return this.rooms.find((r) => r.id === id);
  }

  findVoiceRoomByUserId(userId: number) {
    for (const room of this.rooms) {
      if (room.type === "voice" && room.users.includes(userId)) {
        return room;
      }
    }

    return undefined;
  }

  shouldHearStreamSound(user: User) {
    if (!user.online) {
      return false;
    }

    if (user.id === this.user.id) {
      return true;
    }

    const room = this.findVoiceRoomByUserId(user.id);
    return room?.users.includes(this.user.id) ?? false;
  }

  shouldHearViewerSound(streamerId: number, watcherIds: number[]) {
    return streamerId === this.user.id || watcherIds.includes(this.user.id);
  }

  handleUserStateSound(previous: User, next: User) {
    if (!previous.online || !next.online) {
      return;
    }

    if (
      previous.streaming !== next.streaming &&
      this.shouldHearStreamSound(next)
    ) {
      sound.play(next.streaming ? "stream started" : "stream stopped");
    }

    const addedWatchers = findAddedIds(previous.watchedBy, next.watchedBy);
    if (
      addedWatchers.length > 0 &&
      this.shouldHearViewerSound(next.id, [next.id, ...next.watchedBy])
    ) {
      sound.play("viewer join");
    }

    const removedWatchers = findRemovedIds(previous.watchedBy, next.watchedBy);
    if (
      removedWatchers.length > 0 &&
      this.shouldHearViewerSound(next.id, [next.id, ...previous.watchedBy])
    ) {
      sound.play("viewer leave");
    }
  }

  async joinRoom(room: Room) {
    if (room.type !== "voice") {
      throw new Error("Tried to join a non-voice room");
    }

    if (this.gateway.connected !== true) {
      throw new Error("Gateway is not connected");
    }

    if (this.rtc.room?.id === room.id) {
      return;
    }

    if (this.rtc.connected) {
      this.leaveRoom();
    }

    this.rtc.connect(room);

    this.gateway.send({
      type: "action.voice.join",
      room: room.id,
    });
  }

  leaveRoom(send = true) {
    if (!this.rtc.room) return;

    const id = this.rtc.room.id;
    this.rtc.cleanup();
    sound.play("voice disconnected");
    if (isTauri()) {
      invoke("stop_stream");
    }

    if (send) {
      this.gateway.send({
        type: "action.voice.leave",
        room: id,
      });
    }
  }
}

export class ServerManager {
  store: IPersistantStore = getPlatformStore("servers");
  values: Server[] = $state([]);

  #selected: Server | undefined = $state(undefined);
  get selected() {
    return this.#selected;
  }
  set selected(value: Server | undefined) {
    if (value === this.#selected) {
      return;
    }

    // TODO: think about connection/disconnection strategies
    // this just assumes that you want to be on 1 server at a time
    this.#selected?.gateway.disconnect();

    this.#selected = value;
    if (value === undefined) {
      return;
    }

    if (!value.connected) {
      value.reconnect();
    }

    const index = Math.max(0, this.values.indexOf(value));
    this.store.set("selectedServerIndex", index);
  }

  constructor() {
    this.load();
  }

  async load() {
    const definitions = await this.store.get<ServerDefinition[]>("servers");
    if (!definitions) {
      return;
    }
    this.values = definitions.map(
      (definition) =>
        new Server(
          {
            id: definition.id ?? null,
            name: definition.name,
            url: definition.url,
          },
          () => this.save(),
        ),
    );
    if (this.values.length > 0) {
      let selectedIndex =
        (await this.store.get<number>("selectedServerIndex")) ?? 0;
      selectedIndex = Math.min(selectedIndex, this.values.length - 1);
      selectedIndex = Math.max(selectedIndex, 0);
      this.selected = this.values[selectedIndex];
    }
  }

  async save() {
    const definitions = this.values.map((s) => s.definition);
    this.store.set("servers", definitions);
  }

  add(server: ServerDefinition) {
    this.values.push(new Server(server, () => this.save()));
    this.save();
  }

  update(server: Server, definition: ServerDefinition) {
    const value = this.values.find((s) => s === server);
    if (!value) {
      throw new Error("trying to update a server that does not exist");
    }

    const previousUrl = value.definition.url;
    value.definition = {
      id: value.definition.id,
      name: definition.name,
      url: definition.url,
    };

    this.save();

    if (this.selected === value && previousUrl !== definition.url) {
      value.reconnect();
    }
  }

  remove(server: Server) {
    const value = this.values.find((s) => s === server);
    if (!value) {
      throw new Error("trying do delete a server that does not exist");
    }

    value.gateway.disconnect();

    this.values = this.values.filter((v) => v !== value);

    if (this.selected === value) {
      this.selected = this.values[0] || undefined;
    }

    this.save();
  }
}
