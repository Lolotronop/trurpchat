import type { Message, Room } from "trurpchat-backend";
import { Gateway } from "./gateway.svelte";
import { getPlatformStore, type IPersistantStore } from "./webstore";
import { WebRTC } from "./webrtc.svelte";
import { gitGud } from "./god.svelte";

export type ServerDefinition = {
  name: string;
  url: string;
  // TODO: we should get this from the server
  // with proper auth
  // but this will do for now
  // since the server doesnt actualy do that
  username: string;
};

export class Server {
  definition: ServerDefinition;
  /**
   * expeceted to be in format "http(s)://domain:port/"
   * trailing slash is MANDATORY(no it isnt its just funny to think it is)
   */
  overServer: string | undefined;
  gateway: Gateway;
  rooms: Room[] = $state([]);
  clientId: string | undefined = undefined;
  rtc: WebRTC | undefined = $state(undefined);

  constructor(definition: ServerDefinition) {
    this.definition = definition;
    this.gateway = new Gateway();
    // TODO: maybe we shouldt just connect to all servers?
    // TODO: this is a really bad way to do authentication
    this.gateway.connect(this.definition.url + "?name=" + definition.username);
    this.gateway.onmessage((msg) => this.handleMessage(msg));
  }

  handleMessage(message: Message) {
    if (message.type === "rooms") {
      this.rooms = message.rooms;
    } else if (message.type === "connected") {
      this.clientId = message.id;
      console.log("Connected with ID:", this.clientId);
    }
  }

  reconnect() {
    this.gateway.disconnect();
    this.gateway.connect(
      this.definition.url + "?name=" + this.definition.username,
    );
  }

  async joinRoom(room: Room) {
    if (this.rtc) {
      this.leaveRoom();
    }

    this.rtc = new WebRTC(gitGud(), this, room);
    const username = this.definition.username;
    console.log("Joining room:", room, "with username:", username);

    // TODO: make sure that it is connected!
    this.gateway.send({
      type: "join",
      room: room.name,
    });
  }

  leaveRoom() {
    if (!this.rtc) return;

    // this.g.sound.play("voice disconnected");
    this.gateway.send({
      type: "leave",
      room: this.rtc.room.name,
    });
    this.rtc.cleanup();
    this.rtc = undefined;
  }
}

export class ServerManager {
  store: IPersistantStore = getPlatformStore("servers.json");
  values: Server[] = $state([]);
  selected: Server | undefined = $state(undefined);

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
    this.save();
  }
}
