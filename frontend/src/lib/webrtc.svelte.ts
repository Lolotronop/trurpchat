import { SvelteMap } from "svelte/reactivity";
import type { Message, VoiceChat } from "trurpchat-backend";
import type { Camera } from "./camera.svelte";
import type { Headphones } from "./headphones.svelte";
import type { Mic } from "./mic.svelte";
import type { Server } from "./servers.svelte";
import { sound } from "./sound.svelte";
import { debounce } from "./utils.svelte";
import type { PeerState } from "./webrtc-peer.svelte";
import { Peer } from "./webrtc-peer.svelte";
import { getPlatformStore, type IPersistantStore } from "./webstore";

export class WebRTC {
  peers = new SvelteMap<number, Peer>();
  store: IPersistantStore = getPlatformStore("webrtc");
  room: VoiceChat | undefined = $state(undefined);
  connected = $derived(this.room !== undefined);
  connectedFor: number = $state(0);
  connectedTimeout: NodeJS.Timeout | null = null;
  persistPeerState = new Map<string, (state: PeerState) => void>();

  #streaming: boolean = $state(false);
  get streaming() {
    return this.#streaming;
  }
  set streaming(value: boolean) {
    this.#streaming = value;
    this.server.gateway.send({
      type: "action.user.state",
      streaming: value,
    });
  }

  #cameraEnabled: boolean = $state(false);
  get camera() {
    return this.#cameraEnabled;
  }
  set camera(value: boolean) {
    try {
      if (value) {
        this.enableCamera();
      } else {
        this.disableCamera();
      }
    } catch (e) {
      console.error("Error enabling/disabling camera", e);
      return;
    }

    this.#cameraEnabled = value;
    this.server.gateway.send({
      type: "action.user.state",
      camera: value,
    });
  }

  get cameraStream(): MediaStream | undefined {
    return this.cam?.stream;
  }

  constructor(
    public mic: Mic,
    public headphones: Headphones,
    public cam: Camera,
    public server: Server,
  ) {
    this.mic.effects.nodes.gate.onmessage(({ isOpen }) => {
      for (const peer of this.peers.values()) {
        peer.datachannel?.send(
          JSON.stringify({
            type: "speaking",
            speaking: isOpen && !this.mic.muted,
          }),
        );
      }
    });
  }

  connect(room: VoiceChat) {
    console.log("connecting to room", room.name);
    this.room = room;
  }

  async handleSignalingMessage(msg: Message) {
    if (msg.type === "event.voice.joined") {
      this.handleUserJoined(msg.userId, msg.room);
    } else if (msg.type === "event.voice.left") {
      this.handleUserLeft(msg.userId, msg.room);
    } else if (msg.type === "rtc.offer") {
      await this.acceptCall(msg.offer, msg.sender);
    } else if (msg.type === "rtc.answer") {
      await this.handleAnswer(msg.answer, msg.sender);
    } else if (msg.type === "rtc.ice") {
      await this.handleIceCandidate(msg.candidate, msg.sender);
    }
  }

  async handleUserJoined(userId: number, roomId: number) {
    if (this.room?.id !== roomId) {
      return;
    }

    if (userId !== this.server.user.id) {
      sound.play("user join");
      return;
    }

    sound.play("user join");

    this.connectedFor = 0;
    if (this.connectedTimeout) {
      clearInterval(this.connectedTimeout);
    }
    this.connectedTimeout = setInterval(() => {
      this.connectedFor += 1000;
    }, 1000);

    await this.mic.enable();
    // Initiate calls to existing users
    for (const userId of this.room.users) {
      if (userId === this.server.user.id) continue;
      await this.initiateCall(userId);
    }
  }

  async handleUserLeft(userId: number, roomId: number) {
    if (this.room?.id !== roomId) {
      return;
    }

    if (userId === this.server.user.id) {
      this.cleanup();
      return;
    } else if (roomId === this.room?.id) {
      const peer = this.peers.get(userId);
      if (!peer) {
        return;
      }
      peer.cleanup();
      this.peers.delete(userId);
      sound.play("user leave");
    }
  }

  getPeerStorageKey(targetId: number) {
    const serverId = this.server.definition.id;
    if (serverId === null) {
      return undefined;
    }

    return `${serverId}-${targetId}`;
  }

  getPeerStatePersister(key: string) {
    let persist = this.persistPeerState.get(key);
    if (persist) {
      return persist;
    }

    persist = debounce((state: PeerState) => this.store.set(key, state));
    this.persistPeerState.set(key, persist);
    return persist;
  }

  async createPeer(targetId: number): Promise<Peer> {
    let peer = this.peers.get(targetId);
    if (peer) {
      console.log(`Peer connection with ${targetId} already exists`);
      return peer;
    }
    if (!this.server.iceConfig) {
      throw new Error("ICE config not loaded for server");
    }

    const key = this.getPeerStorageKey(targetId);
    const initialState = key ? await this.store.get<PeerState>(key) : undefined;

    peer = new Peer(
      targetId,
      this.mic.output.stream,
      this.headphones,
      this.server.iceConfig,
      initialState,
      (state) => {
        if (!key) {
          return;
        }

        this.getPeerStatePersister(key)(state);
      },
    );
    this.peers.set(targetId, peer);

    if (this.cameraStream) {
      const [cameraTrack] = this.cameraStream.getVideoTracks();
      peer.pc.addTrack(cameraTrack, this.cameraStream);
    }

    if (!this.mic.stream) {
      throw new Error("Local stream not available");
    }

    peer.pc.onicecandidate = (event) => {
      if (!event.candidate) {
        return;
      }
      this.server.gateway.send({
        type: "rtc.ice",
        candidate: event.candidate,
        target: targetId,
        sender: this.server.user.id,
      });
    };

    peer.pc.onconnectionstatechange = () => {
      if (
        peer.pc.connectionState === "disconnected" ||
        peer.pc.connectionState === "failed"
      ) {
        if (peer.pc.connectionState === "failed") {
          console.error("Peer connection failed", peer.targetId);
        }
        peer.cleanup();
        this.peers.delete(targetId);
      }
    };

    peer.pc.onicecandidateerror = (_) => {
      // console.warn("ICE candidate error:", event);
    };

    peer.pc.onnegotiationneeded = async (event) => {
      console.log("onnegotiationneeded", event);
      const offer = await peer.pc.createOffer();
      // const sdp = setAudioMaxInSDP(offer.sdp, BITRATE, CHANNELS);
      // offer = { ...offer, sdp };
      await peer.pc.setLocalDescription(offer);

      this.server.gateway.send({
        type: "rtc.offer",
        offer: offer,
        target: targetId,
        sender: this.server.user.id,
      });
    };

    return peer;
  }

  async initiateCall(targetId: number) {
    if (!this.room?.users.includes(targetId)) {
      console.error(`User ${targetId} not found`);
      return;
    }
    if (this.peers.has(targetId)) {
      console.error(`Already connected to ${targetId}`);
      return;
    }
    const peer = await this.createPeer(targetId);
    const chan = peer.pc.createDataChannel("speaking");
    peer.setDatachannel(chan);

    const offer = await peer.pc.createOffer();
    // const sdp = setAudioMaxInSDP(offer.sdp, BITRATE, CHANNELS);
    // offer = { ...offer, sdp };
    await peer.pc.setLocalDescription(offer);

    this.server.gateway.send({
      type: "rtc.offer",
      offer: offer,
      target: targetId,
      sender: this.server.user.id,
    });
  }

  async acceptCall(offer: RTCSessionDescriptionInit, senderId: number) {
    const peer = await this.createPeer(senderId);

    await peer.pc.setRemoteDescription(offer);

    const answer = await peer.pc.createAnswer();
    // const sdp = setAudioMaxInSDP(answer.sdp, BITRATE, CHANNELS);
    // answer = { ...answer, sdp };
    await peer.pc.setLocalDescription(answer);

    // Send answer
    this.server.gateway.send({
      type: "rtc.answer",
      answer: answer,
      target: senderId,
      sender: this.server.user.id,
    });
  }

  async handleAnswer(answer: RTCSessionDescriptionInit, senderId: number) {
    const peer = this.peers.get(senderId);
    if (!peer) {
      console.error(`Peer for ${senderId} not found`);
      return;
    }
    await peer.pc.setRemoteDescription(answer);
  }

  async handleIceCandidate(candidate: RTCIceCandidateInit, senderId: number) {
    const peer = this.peers.get(senderId);
    if (!peer) {
      console.error(`Peer for ${senderId} not found`);
      return;
    }
    await peer.pc.addIceCandidate(candidate);
  }

  async enableCamera() {
    await this.cam.enable();
    const stream = this.cam.stream;
    if (!stream) {
      return;
    }
    for (const peer of this.peers.values()) {
      peer.pc.addTrack(stream.getVideoTracks()[0], stream);
    }
  }

  disableCamera() {
    const stream = this.cam.stream;
    if (!stream) {
      return;
    }
    this.cam.disable();
  }

  cleanup() {
    for (const peer of this.peers.values()) {
      peer.cleanup();
    }
    this.peers.clear();

    this.connectedFor = 0;
    if (this.connectedTimeout) {
      clearInterval(this.connectedTimeout);
    }
    this.connectedTimeout = null;
    console.log("room disconnected, setting room to undefined");
    this.room = undefined;

    this.mic.disable();
    this.cam.disable();
    this.camera = false;
    this.streaming = false;
  }
}
