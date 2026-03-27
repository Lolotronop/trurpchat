import { invoke, isTauri } from "@tauri-apps/api/core";
import type {
  ConnectedUserState,
  DbUser,
  Message,
  OfflineUser,
  Room,
  User,
} from "trurpchat-backend";
import type { Key } from "trurpchat-backend/src/db";
import { Gateway } from "./gateway.svelte";
import { gitGud } from "./god.svelte";
import { sound } from "./sound.svelte";
import { WebRTC } from "./webrtc.svelte";
import { getPlatformStore, type IPersistantStore } from "./webstore";
import { TextMessageCache } from "./messages.svelte";

export type ServerDefinition = {
  name: string;
  url: string;
};

function createDefaultConnectedUserState(): ConnectedUserState {
  return {
    muted: false,
    deafened: false,
    camera: false,
    streaming: false,
    watching: null,
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

export class Server {
  definition: ServerDefinition;
  /**
   * expeceted to be in format "http(s)://domain:port/"
   * trailing slash is MANDATORY(no it isnt its just funny to think it is)
   */
  overServerUrl: string | undefined = $state(undefined);
  gateway: Gateway;
  rooms: Room[] = $state([]);
  rtc: WebRTC | undefined = $state(undefined);
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

  messages: TextMessageCache = new TextMessageCache();

  constructor(definition: ServerDefinition) {
    this.definition = definition;
    this.gateway = new Gateway();
    this.gateway.onmessage((msg) => {
      this.handleMessage(msg);
      if (this.rtc) this.rtc.handleSignalingMessage(msg);
    });
    this.gateway.onclose(() => {
      this.leaveRoom(false);
    });
    this.gateway.onopen(() => {
      this.gateway.send({
        type: "action.user.state",
        muted: gitGud().mic.muted,
      });
    });

    this.messages.onfetchrequest = (channelId, blockId) => {
      const room = this.findRoom(channelId);
      if (!room) return;
      if (room.type !== "text") return;
      if (blockId > room.nextMessageId - 1) {
        // TODO: figure out why this happens in the first place
        console.error(
          `onfetchrequest: blockId ${blockId} is greater than nextMessageId ${room.nextMessageId}`,
        );
        return;
      }
      this.gateway.send({
        type: "action.message.list",
        roomId: channelId,
        fromId: blockId,
        toId: blockId + this.messages.BLOCK_SIZE,
      });
    };
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

      if (this.rtc?.room.id === message.roomId) {
        this.leaveRoom();
      }

      this.rooms.splice(roomIndex, 1);
    } else if (message.type === "event.connected") {
      this.user = message.user;
    } else if (message.type === "event.user.list") {
      this.users = message.users;
    } else if (message.type === "event.user.online") {
      const userIndex = this.users.findIndex((user) => user.id === message.userId);
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
      const userIndex = this.users.findIndex((user) => user.id === message.userId);
      if (userIndex === -1) {
        return;
      }

      const user = this.users[userIndex];
      if (!user.online) {
        return;
      }

      this.users[userIndex] = toOfflineUser(user);
    } else if (message.type === "event.user.created") {
      const userIndex = this.users.findIndex((user) => user.id === message.user.id);
      if (userIndex === -1) {
        this.users.push(message.user);
      } else {
        this.users[userIndex] = message.user;
      }
    } else if (message.type === "event.user.updated") {
      const userIndex = this.users.findIndex((user) => user.id === message.user.id);
      if (userIndex === -1) {
        this.users.push(toOfflineUser(message.user));
      } else {
        this.users[userIndex] = patchUser(this.users[userIndex]!, message.user);
      }
    } else if (message.type === "event.user.deleted") {
      const userIndex = this.users.findIndex((user) => user.id === message.userId);
      if (userIndex === -1) {
        return;
      }
      this.users.splice(userIndex, 1);
    } else if (message.type === "event.user.state") {
      const userIndex = this.users.findIndex((user) => user.id === message.user.id);
      if (userIndex === -1) {
        this.users.push(message.user);
      } else {
        this.users[userIndex] = message.user;
      }
    } else if (message.type === "event.oven") {
      this.overServerUrl = message.ovenServerUrl;
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
      const inRoom = this.rtc?.room.id === room.id;
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
    }
  }

  reconnect() {
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

  async joinRoom(room: Room) {
    if (room.type !== "voice") {
      throw new Error("Tried to join a non-voice room");
    }

    if (this.gateway.connected !== true) {
      throw new Error("Gateway is not connected");
    }

    if (this.rtc && this.rtc.room.id === room.id) {
      return;
    }

    if (this.rtc) {
      this.leaveRoom();
    }

    this.rtc = new WebRTC(gitGud().mic, gitGud().camera, this, room);

    this.gateway.send({
      type: "action.voice.join",
      room: room.id,
    });
  }

  leaveRoom(send = true) {
    if (!this.rtc) return;

    const id = this.rtc.room.id;
    this.rtc?.cleanup();
    this.rtc = undefined;
    sound.play("voice disconnected");
    if (isTauri()) {
      invoke("stop_stream");
    }
    send &&
      this.gateway.send({
        type: "action.voice.leave",
        room: id,
      });
  }
}

export class ServerManager {
  store: IPersistantStore = getPlatformStore("servers.json");
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
    this.values = definitions.map((d) => new Server(d));
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
    this.values.push(new Server(server));
    this.save();
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
