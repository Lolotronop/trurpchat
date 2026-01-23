import { SvelteMap } from "svelte/reactivity";
import type { ConnectedUser, Message, VoiceChat } from "trurpchat-backend";
import type { God } from "./god.svelte";
import { getAudioContext } from "./audiocontext";
import type { Server } from "./servers.svelte";
import { Peer } from "./webrtc-peer.svelte";

// TODO: this whould be dictated by the current server
const TURN_SERVER_IP = "45.143.95.55";
export const ICE_CONFIG: RTCConfiguration = {
  iceServers: [
    {
      urls: [
        "stun:stun1.l.google.com:19302",
        "stun:stunserver.org:3478",
        "stun:stun.stunprotocol.org:3478",
        "stun:stun.nextcloud.com:443",
      ],
    },
    {
      urls: ["turn:openrelay.metered.ca:80"],
      username: "openrelayproject",
      credential: "openrelayproject",
    },
    {
      urls: [
        `stun:${TURN_SERVER_IP}:3478`,
        `turn:${TURN_SERVER_IP}:3478?transport=udp`,
        `turn:${TURN_SERVER_IP}:5349?transport=tcp`,
      ],
      username: "testuser",
      credential: "testtoken",
    },
  ],
};

export class WebRTC {
  isConnected: boolean = $state(false);
  server: Server;
  room: VoiceChat;
  deafenNode: GainNode;
  peers = new SvelteMap<number, Peer>();
  connectedFor: number = $state(0);
  connectedTimeout: NodeJS.Timeout | null = null;

  #streaming: boolean = $state(false);
  get streaming() {
    return this.#streaming;
  }
  set streaming(value: boolean) {
    this.#streaming = value;
    this.server.gateway.send({
      type: "action.voice.stream",
      streaming: value,
    });
  }

  #watching: number | null = $state(null);
  get watching() {
    return this.#watching;
  }
  set watching(value: number | null) {
    this.#watching = value;
    this.server.gateway.send({
      type: "action.voice.watch",
      watching: value,
    });
  }

  constructor(
    private g: God,
    server: Server,
    room: VoiceChat,
  ) {
    this.deafenNode = getAudioContext().createGain();
    this.deafenNode.connect(getAudioContext().destination);
    this.server = server;
    this.room = room;

    this.server.gateway.onmessage((data) => {
      this.handleSignalingMessage(data);
    });

    g.mic.nodes.noiseGate.port.addEventListener("message", (event) => {
      for (const peer of this.peers.values()) {
        peer.datachannel?.send(JSON.stringify({
          type: "speaking",
          speaking: event.data.isOpen && !g.muted,
        }))
      }
    })
  }

  async handleSignalingMessage(msg: Message) {
    if (msg.type === "event.voice.joined") {
      this.handleUserJoined(msg.user, msg.room);
    } else if (msg.type === "event.voice.left") {
      this.handleUserJoined(msg.user, msg.room);
    } else if (msg.type === "rtc.offer") {
      await this.acceptCall(msg.offer, msg.sender);
    } else if (msg.type === "rtc.answer") {
      await this.handleAnswer(msg.answer, msg.sender);
    } else if (msg.type === "rtc.ice") {
      await this.handleIceCandidate(msg.candidate, msg.sender);
    }
  }

  async handleUserJoined(user: ConnectedUser, roomId: number) {
    if (this.room.id !== roomId) {
      return;
    }

    if (user.id !== this.server.user.id) {
      this.g.sound.play("user join");
      this.room.users.push(user);
      return;
    }

    this.g.sound.play("user join");

    this.connectedFor = 0;
    if (this.connectedTimeout) {
      clearInterval(this.connectedTimeout);
    }
    this.connectedTimeout = setInterval(() => {
      this.connectedFor += 1000;
    }, 1000);

    await this.g.mic.connect();
    // Initiate calls to existing users
    for (const user of this.room.users) {
      if (user.id === this.server.user.id) continue;
      await this.initiateCall(user.id);
    }
  }

  async handleUserLeft(user: ConnectedUser, roomId: number) {
    if (user.id === this.server.user.id) {
      this.cleanup();
      return;
    } else {
      if (roomId === this.room?.id) {
        this.peers.get(user.id)?.cleanup();
        this.peers.delete(user.id);
        this.room.users = this.room.users.filter(
          (u) => u.id !== user.id,
        );
        this.g.sound.play("user leave");
      }
    }
  }

  createPeer(targetId: number): Peer {
    let peer = this.peers.get(targetId);
    if (peer) {
      console.log(`Peer connection with ${targetId} already exists`);
      return peer;
    }
    peer = new Peer(targetId, this.g.mic, this.deafenNode);
    this.peers.set(targetId, peer);

    if (!this.g.mic.stream) {
      throw new Error("Local stream not available");
    }

    // Handle ICE candidates
    peer.pc.onicecandidate = (event) => {
      if (!event.candidate) {
        console.warn("No ice candidate");
        return;
      }
      this.server.gateway.send({
        type: "rtc.ice",
        candidate: event.candidate,
        target: targetId,
        sender: this.server.user.id,
      });
    };

    // Handle connection state changes
    peer.pc.onconnectionstatechange = () => {
      if (
        peer.pc.connectionState === "disconnected" ||
        peer.pc.connectionState === "failed"
      ) {
        peer.cleanup();
        this.peers.delete(targetId);
      }
    };
    peer.pc.onicecandidateerror = (event) => {
      console.warn("ICE candidate error:", event);
    };

    return peer;
  }

  async initiateCall(targetId: number) {
    if (!this.room?.users.find((user) => user.id === targetId)) {
      console.error(`User ${targetId} not found`);
      return;
    }
    if (this.peers.has(targetId)) {
      console.error(`Already connected to ${targetId}`);
      return;
    }
    const peer = this.createPeer(targetId);
    const chan = peer.pc.createDataChannel("speaking");
    peer.setDatachannel(chan);

    let offer = await peer.pc.createOffer();
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
    const peer = this.createPeer(senderId);

    await peer.pc.setRemoteDescription(offer);

    let answer = await peer.pc.createAnswer();
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

  cleanup() {
    for (const peer of this.peers.values()) {
      peer.cleanup();
    }
    this.connectedFor = 0;
    if (this.connectedTimeout) {
      clearInterval(this.connectedTimeout);
    }
    this.connectedTimeout = null;
    this.peers.clear();
    this.g.mic.disconnect();
    this.isConnected = false;
    this.streaming = false;
    this.watching = null;
  }
}
