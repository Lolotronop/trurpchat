import type { ConnectedUser, Message, Room, User } from "trurpchat-backend";
import { Gateway } from "./gateway.svelte";
import { getPlatformStore, type IPersistantStore } from "./webstore";
import { WebRTC } from "./webrtc.svelte";
import { gitGud } from "./god.svelte";

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

  constructor(definition: ServerDefinition) {
    this.definition = definition;
    this.gateway = new Gateway();
    this.gateway.onmessage(this.handleMessage.bind(this));
  }

  handleMessage(message: Message) {
    if (message.type === "event.rooms") {
      this.rooms = message.rooms;
    } else if (message.type === "event.connected") {
      this.user = message.user;
    } else if (message.type === "event.users") {
      this.users.online = message.online;
      this.users.offline = message.offline;
    } else if (message.type === "event.oven") {
      this.overServerUrl = message.ovenServerUrl;
    }
  }

  reconnect() {
    this.gateway.disconnect();
    this.gateway.connect(this.definition.url);
  }

  get connected() {
    return this.gateway.connected;
  }

  async joinRoom(room: Room) {
    if (this.rtc) {
      this.leaveRoom();
    }

    if (room.type !== "voice") {
      throw new Error("Tried to join a non-voice room");
    }

    this.rtc = new WebRTC(gitGud(), this, room);
    const username = this.user?.name;
    console.log("Joining room:", room, "with username:", username);

    // TODO: make sure that it is connected!
    this.gateway.send({
      type: "action.voice.join",
      room: room.id,
    });
  }

  leaveRoom() {
    if (!this.rtc) return;

    // this.g.sound.play("voice disconnected");
    this.gateway.send({
      type: "action.voice.leave",
      room: this.rtc.room.id,
    });
    this.rtc.cleanup();
    this.rtc = undefined;
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
