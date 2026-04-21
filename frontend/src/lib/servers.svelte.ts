import { invoke, isTauri } from "@tauri-apps/api/core";
import type { IceConfig, Message, Room, User, Key } from "trurpchat-backend";
import { Gateway } from "./gateway.svelte";
import { gitGud } from "./god.svelte";
import { BLOCK_SIZE, TextMessageCache, UnreadThing } from "./messages.svelte";
import { sound } from "./sound.svelte";
import { WebRTC } from "./webrtc.svelte";
import { getPlatformStore, type IPersistantStore } from "./webstore";
import { mentions } from "trurpchat-shared";
import { focused } from "./focus.svelte";
import { sendNotification } from "@tauri-apps/plugin-notification";
import { UserStore } from "./users.svelte";
import { RoomStore } from "./rooms.svelte";

export type ServerDefinition = {
  id: string | null;
  name: string;
  url: string;
};

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
  rooms: RoomStore = new RoomStore();
  rtc: WebRTC;
  user: User = $state({
    id: -1,
    name: "T",
    displayName: "T",
    type: "text",
    permissions: 0,
    deletedAt: null,
    online: false,
  });

  users: UserStore = new UserStore();
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
      const room = this.rooms.find(roomId);
      if (!room) return;
      if (room.type !== "text") return;
      return room;
    },

    (roomId, blockId) => {
      const room = this.rooms.find(roomId);
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

  selectedRoomId: number | undefined = $state(undefined);
  selectedRoom = $derived.by(() => {
    if (this.selectedRoomId === undefined) {
      return undefined;
    }

    return this.rooms.find(this.selectedRoomId);
  });

  constructor(
    definition: ServerDefinition,
    persistDefinition: () => void | Promise<void>,
  ) {
    this.definition = definition;
    this.#persistDefinition = persistDefinition;
    void this.rooms.setServerId(this.definition.id);
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
      this.rooms.setRooms(message.rooms);
    } else if (message.type === "event.room.updated") {
      this.rooms.upsertRoom(message.room);
    } else if (message.type === "event.room.deleted") {
      const room = this.rooms.find(message.roomId);
      if (!room) {
        console.error(
          `event.room.deleted: room ${message.roomId} not found in rooms`,
        );
        return;
      }

      if (this.rtc.room?.id === message.roomId) {
        this.leaveRoom();
      }

      this.rooms.deleteRoom(message.roomId);
    } else if (message.type === "event.connected") {
      this.user = message.user;
    } else if (message.type === "event.role.list") {
      this.users.setRoles(message.roles, message.assignments);
    } else if (message.type === "event.role.created") {
      this.users.createRole(message.role);
    } else if (message.type === "event.role.updated") {
      this.users.updateRole(message.role);
    } else if (message.type === "event.role.deleted") {
      this.users.deleteRole(message.roleId);
    } else if (message.type === "event.role.assigned") {
      this.users.assignRole(message.userId, message.roleId);
    } else if (message.type === "event.role.unassigned") {
      this.users.unassignRole(message.userId, message.roleId);
    } else if (message.type === "event.user.list") {
      this.users.setUsers(message.users);
    } else if (message.type === "event.user.online") {
      this.users.setUserOnline(message.userId);
    } else if (message.type === "event.user.offline") {
      this.users.setUserOffline(message.userId);
    } else if (message.type === "event.user.created") {
      this.users.upsertCreatedUser(message.user);
    } else if (message.type === "event.user.updated") {
      this.users.patchDbUser(message.user);
    } else if (message.type === "event.user.deleted") {
      this.users.deleteUser(message.userId);
    } else if (message.type === "event.user.state") {
      const previousUser = this.users.find(message.user.id);
      this.users.setUserState(message.user);

      if (
        previousUser?.online &&
        previousUser.streaming &&
        !message.user.streaming
      ) {
        this.rtc.streamPlayers.get(message.user.id)?.stop();
      }

      if (previousUser) {
        this.handleUserStateSound(previousUser, message.user);
      }
    } else if (message.type === "event.startup.config") {
      if (this.definition.id === null) {
        this.definition.id = message.serverId;
        void this.rooms.setServerId(this.definition.id);
        void this.#persistDefinition();
      } else if (this.definition.id !== message.serverId) {
        console.warn(
          `Server id mismatch for ${this.definition.name}: expected ${this.definition.id}, got ${message.serverId}`,
        );
        this.definition.id = message.serverId;
        void this.rooms.setServerId(this.definition.id);
        void this.#persistDefinition();
      }
      this.overServerUrl = message.ovenServerUrl;
      this.iceConfig = message.iceConfig;
    } else if (message.type === "event.key.list") {
      this.keys = message.keys;
    } else if (message.type === "event.user.me") {
      this.user = message.user;
    } else if (message.type === "event.voice.joined") {
      const room = this.rooms.addUserToVoiceRoom(message.room, message.userId);
      if (!room) {
        return;
      }
    } else if (message.type === "event.voice.left") {
      const room = this.rooms.find(message.room);
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

      this.rooms.removeUserFromVoiceRoom(message.room, message.userId);

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
      this.rooms.setNextMessageId(message.message.roomId, message.message.id + 1);
      this.messages.append(message.message);

      if (message.message.hasMention) {
        const mentionsMeDirectly = mentions.user.includes(
          message.message.text,
          this.user.id,
        );
        const myRoles = this.users.find(this.user.id)?.roles ?? [];
        const mentionsMyRole = myRoles.some((role) =>
          mentions.role.includes(message.message.text, role.id),
        );

        if (mentionsMeDirectly || mentionsMyRole) {
          this.unread.incMentiones(message.message.roomId);

          if (!this.shouldSendRoomNotification(message.message.roomId)) {
            return;
          }

          const room = this.messages.getRoom(message.message.roomId, false);

          if (
            !focused() ||
            this.selectedRoomId !== message.message.roomId ||
            !room?.isAtBottom
          ) {
            sound.play("message");
            const room = this.rooms.find(message.message.roomId);
            const author = this.users.find(message.message.userId);
            if (!author || !room) return;
            let body = "";
            const parts = mentions.split(message.message.text);
            for (let i = 0; i < parts.length; i++) {
              const part = parts[i];
              if (part.type === "text") {
                body += part.value;
              } else if (part.type === "user") {
                body += mentions.user.format.name(
                  this.users.find(part.userId) ?? part.userId,
                );
              } else {
                body += mentions.role.format.name(
                  this.users.findRole(part.roleId) ?? part.roleId,
                );
              }
            }
            sendNotification({
              title: `#${room.name} @${author.username}`,
              body,
            });
            return;
          }
        }
      }
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

  getRoomNotificationMode(roomId: number) {
    return this.rooms.find(roomId)?.notificationMode ?? "normal";
  }

  shouldSendRoomNotification(roomId: number) {
    return this.getRoomNotificationMode(roomId) === "normal";
  }

  shouldHearStreamSound(user: User) {
    if (!user.online) {
      return false;
    }

    if (user.id === this.user.id) {
      return true;
    }

    const room = this.rooms.findVoiceRoomByUserId(user.id);
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
