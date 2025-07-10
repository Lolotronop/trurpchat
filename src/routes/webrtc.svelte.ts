import type { Gateway } from "./gateway.svelte";
import {
  createLoudnessMeter,
  type LocalSourceManager,
} from "./localAudioManager.svelte";

const TURN_SERVER_IP = "45.143.95.55";
const ICE_CONFIG = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
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

export interface PeerInfo {
  peerConnection?: RTCPeerConnection;
  volume?: number;
  gainNode?: GainNode;
  analyzerNode?: AnalyserNode;
  intervalId?: number;
  peak?: number;
  rms?: number;
}

export class WebRTC {
  isConnected: boolean = $state(false);
  room: string = $state("");
  clientId: string;
  private localAudio: LocalSourceManager;
  private gateway: Gateway;
  private audioContext: AudioContext;
  peers: Record<string, PeerInfo> = $state({});
  users: Array<{ id: string; username?: string }> = $state([]);

  constructor(
    gateway: Gateway,
    localAudio: LocalSourceManager,
    clientId?: string,
  ) {
    this.gateway = gateway;
    this.localAudio = localAudio;
    this.clientId = Math.floor(Math.random() * 1000).toString();
    this.audioContext = new AudioContext();
    this.gateway.onmessage = (data) => {
      console.log("Received message:", data);
      this.handleSignalingMessage(data);
    };
  }

  setVolume(userId: string, volume: number) {
    const peer = this.peers[userId];
    if (!peer) {
      console.error(`Peer for ${userId} not found`);
      return;
    }
    peer.volume = volume;
    const node = peer.gainNode;
    if (!node) {
      console.error(`Gain node for ${userId} not found`);
      return;
    }
    node.gain.setValueAtTime(volume, this.audioContext.currentTime);
  }

  async handleSignalingMessage(rawData: unknown) {
    const data = rawData as any;

    switch (data.type) {
      case "connected":
        this.clientId = data.id;
        this.isConnected = true;
        console.log("Connected with ID:", this.clientId);
        break;

      case "room-joined":
        this.room = data.room;
        this.isConnected = true;
        this.users = data.users;
        console.log("Joined room:", this.room, "with users:", this.users);

        // Initiate calls to existing users
        for (const user of this.users) {
          await this.initiateCall(user.id);
        }
        break;

      case "left-room":
        this.room = "";
        this.isConnected = false;
        this.users = [];
        console.log("Left room");
        break;

      case "user-joined":
        console.log("User joined:", data.userId, data.username);
        this.users.push({ id: data.userId, username: data.username });
        break;

      case "user-left":
        console.log("User left:", data.userId);
        this.users = this.users.filter((u) => u.id !== data.userId);

        // Close peer connection with this user
        const peer = this.peers[data.userId];
        if (peer) {
          peer.peerConnection?.close();
          peer.gainNode?.disconnect();
          peer.analyzerNode?.disconnect();
          clearInterval(peer.intervalId);
          delete this.peers[data.userId];
        }
        break;

      case "offer":
        await this.handleOffer(data.offer, data.sender);
        break;

      case "answer":
        await this.handleAnswer(data.answer, data.sender);
        break;

      case "ice-candidate":
        await this.handleIceCandidate(data.candidate, data.sender);
        break;
    }
  }

  async createPeerConnection(targetId: string): Promise<RTCPeerConnection> {
    const peer = this.peers[targetId]!;
    if (peer) {
      console.log(`Peer connection with ${targetId} already exists`);
      return peer.peerConnection!;
    }

    const pc = new RTCPeerConnection(ICE_CONFIG);

    console.log("and now its", this.localAudio.stream);
    if (!this.localAudio.stream) {
      throw new Error("Local stream not available");
    }

    // Add local stream to peer connection
    const [audioTrack] = this.localAudio.destination.stream.getAudioTracks();
    pc.addTrack(audioTrack, this.localAudio.stream);

    // Handle remote stream
    pc.ontrack = (event) => {
      console.log("Received remote stream from:", targetId);
      console.log(`Recieving ${event.streams.length} streams`);
      const audioTrack = event.streams[0].getAudioTracks()[0];

      if (!audioTrack) {
        throw new Error(`Audio track for ${targetId} not found`);
      }
      const peer = this.peers[targetId];
      if (!peer) {
        throw new Error(`Peer for ${targetId} not found`);
      }

      let gainNode = peer.gainNode;
      if (!gainNode) {
        gainNode = this.audioContext.createGain();
        peer.gainNode = gainNode;
        const analyzerNode = this.audioContext.createAnalyser();
        peer.analyzerNode = analyzerNode;
        analyzerNode.fftSize = 128;
        const interval = createLoudnessMeter(analyzerNode, 60, (rms, peak) => {
          peer.peak = peak;
          peer.rms = rms;
        });
        peer.intervalId = interval as unknown as number;
        gainNode.connect(analyzerNode);
        analyzerNode.connect(this.audioContext.destination);
      }

      this.audioContext
        .createMediaStreamSource(event.streams[0])
        .connect(gainNode);
    };

    // Handle ICE candidates
    pc.onicecandidate = (event) => {
      if (event.candidate) {
        this.gateway.send({
          type: "ice-candidate",
          candidate: event.candidate,
          target: targetId,
          senderId: this.clientId,
        });
      }
    };

    // Handle connection state changes
    pc.onconnectionstatechange = () => {
      console.log(`Connection state with ${targetId}:`, pc.connectionState);
      if (
        pc.connectionState === "disconnected" ||
        pc.connectionState === "failed"
      ) {
        const peer = this.peers[targetId];
        peer?.gainNode?.disconnect();
        peer?.analyzerNode?.disconnect();
        clearInterval(peer?.intervalId);
        delete this.peers[targetId];
        console.log(`Connection with ${targetId} failed`);
      }
    };

    pc.onnegotiationneeded = async () => {
      console.log(`Negotiation needed for ${targetId}`);
      if (!pc.localDescription) {
        return;
      }
      for (let user of this.users) {
        await this.initiateCall(user.id);
      }
    };

    this.peers[targetId] = {};
    this.peers[targetId].peerConnection = pc;
    return pc;
  }

  async initiateCall(targetId: string) {
    await this.localAudio.enableMic();
    console.log("Initiating call to:", targetId);
    const pc = await this.createPeerConnection(targetId);

    let offer = await pc.createOffer();
    // const sdp = setAudioMaxInSDP(offer.sdp, BITRATE, CHANNELS);
    // offer = { ...offer, sdp };
    await pc.setLocalDescription(offer);

    // Send offer
    this.gateway.send({
      type: "offer",
      offer: offer,
      target: targetId,
      senderId: this.clientId,
    });
  }

  async handleOffer(offer: RTCSessionDescriptionInit, senderId: string) {
    console.log("Received offer from:", senderId);
    // this.peerConnections.delete(senderId);
    const pc = await this.createPeerConnection(senderId);

    await pc.setRemoteDescription(offer);

    let answer = await pc.createAnswer();
    // const sdp = setAudioMaxInSDP(answer.sdp, BITRATE, CHANNELS);
    // answer = { ...answer, sdp };
    await pc.setLocalDescription(answer);

    // Send answer
    this.gateway.send({
      type: "answer",
      answer: answer,
      target: senderId,
      senderId: this.clientId,
    });
  }

  async handleAnswer(answer: RTCSessionDescriptionInit, senderId: string) {
    console.log("Received answer from:", senderId);

    const peer = this.peers[senderId];
    if (!peer) {
      console.error(`Peer for ${senderId} not found`);
      return;
    }
    const pc = peer.peerConnection;
    if (!pc) {
      console.error(`Peer connection with ${senderId} not found`);
      return;
    }

    await pc.setRemoteDescription(answer);
  }

  async handleIceCandidate(candidate: RTCIceCandidateInit, senderId: string) {
    const peer = this.peers[senderId];
    if (!peer) {
      console.error(`Peer for ${senderId} not found`);
      return;
    }
    const pc = peer.peerConnection;
    if (!pc) {
      console.error(`Peer connection with ${senderId} not found`);
      return;
    }

    await pc.addIceCandidate(candidate);
  }

  disconnect() {
    if (this.isConnected) {
      this.leaveRoom();
    }

    for (const peer of Object.values(this.peers)) {
      peer.peerConnection?.close();
      peer.gainNode?.disconnect();
      peer.analyzerNode?.disconnect();
      clearInterval(peer.intervalId);
    }
    this.peers = {};

    this.localAudio.disableMic();

    this.isConnected = false;

    this.users = [];
    this.room = "";
  }

  joinRoom(username: string, room: string) {
    console.log("Joining room:", room, "with username:", username);
    this.gateway.send({
      type: "join-room",
      room: room.trim(),
      username: username.trim(),
      senderId: this.clientId,
    });
  }

  leaveRoom() {
    for (const peer of Object.values(this.peers)) {
      peer.peerConnection?.close();
      peer.gainNode?.disconnect();
      peer.analyzerNode?.disconnect();
      clearInterval(peer.intervalId);
    }
    this.peers = {};

    this.gateway.send({
      type: "leave-room",
      senderId: this.clientId,
    });
  }
}
