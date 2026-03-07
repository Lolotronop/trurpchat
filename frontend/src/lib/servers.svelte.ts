import type { ConnectedUser, Message, Room, User } from "trurpchat-backend";
import type { Key } from "trurpchat-backend/src/db";
import { Gateway } from "./gateway.svelte";
import { getPlatformStore, type IPersistantStore } from "./webstore";
import { WebRTC } from "./webrtc.svelte";
import { sound } from "./sound.svelte";
import { gitGud } from "./god.svelte";
import { invoke, isTauri } from "@tauri-apps/api/core";

export type ServerDefinition = {
  name: string;
  url: string;
};

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
  user: User = $state({ id: -1, name: "T", type: "text", permissions: 0 });
  users: {
    online: ConnectedUser[];
    offline: User[];
  } = $state({ online: [], offline: [] });
  keys: Key[] = $state([]);

  constructor(definition: ServerDefinition) {
    this.definition = definition;
    this.gateway = new Gateway();
    this.gateway.onmessage((msg) => {
      this.handleMessage(msg);
      if (this.rtc) this.rtc.handleSignalingMessage(msg);
    });
  }

  handleMessage(message: Message) {
    if (message.type === "event.room.list") {
      this.rooms = message.rooms;
      this.rooms.sort((a, b) => a.order - b.order);
    } else if (message.type === "event.room.update") {
      const roomIndex = this.rooms.findIndex((r) => r.id === message.room.id);
      if (roomIndex === -1) {
        this.rooms.push(message.room);
      } else {
        const room = this.rooms[roomIndex];
        this.rooms[roomIndex] = { ...room, ...message.room };
      }
      this.rooms.sort((a, b) => a.order - b.order);
    } else if (message.type === "event.connected") {
      this.user = message.user;
    } else if (message.type === "event.user.list") {
      this.users.online = message.online;
      this.users.offline = message.offline;
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
      const has = room.users.find((u) => u.id === message.user.id);
      if (has) {
        return;
      }
      room.users.push(message.user);
    } else if (message.type === "event.voice.left") {
      const room = this.findRoom(message.room);
      if (!room || room.type !== "voice") {
        return;
      }

      let index = room.users.findIndex((u) => u.id === message.user.id);
      if (index === -1) {
        console.error(
          `event.voice.left: user ${message.user.id} not found in room ${message.room}`,
        );
        return;
      }
      room.users.splice(index, 1);

      const isMe = message.user.id === this.user.id;
      const inRoom = this.rtc?.room.id === room.id;
      if (isMe && inRoom) {
        this.leaveRoom(false);
      }
    } else if (message.type === "event.voice.userstate") {
      const room = this.findRoom(message.room);
      if (!room || room.type !== "voice") {
        return;
      }
      const userIndex = room.users.findIndex((u) => u.id === message.user.id);
      if (userIndex === -1) {
        console.error(
          `event.voice.userstate: user ${message.user.id} not found in room ${message.room}`,
        );
        return;
      }
      room.users[userIndex] = message.user;
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
    let online = this.users.online.find((u) => u.id === id);
    let offline = this.users.offline.find((u) => u.id === id);
    return online ?? offline;
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

    // TODO: we are still grabbing mic from the god
    this.rtc = new WebRTC(gitGud().mic, this, room);

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
      this.selected = this.values[0];
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

    this.values = this.values.filter((v) => v != value);

    if (this.selected === value) {
      this.selected = this.values[0] || undefined;
    }

    this.save();
  }
}
