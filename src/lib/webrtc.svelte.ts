import { SvelteMap } from "svelte/reactivity";
import type { Gateway } from "./gateway.svelte";
import type { Mic } from "./mic.svelte";

export class Peer {
  mic: Mic;
  pc: RTCPeerConnection;
  analyzer: AudioWorkletNode;

  gainNode: GainNode;
  muteNode: GainNode;
  #volume: number = 1;
  get volume(): number {
    return this.#volume;
  }
  set volume(value: number) {
    this.#volume = value;
    this.gainNode.gain.setTargetAtTime(value, this.mic.c.currentTime, 0.01);
  }

  #mute = $state(false);
  get mute(): boolean {
    return this.#mute;
  }
  set mute(value: boolean) {
    this.#mute = value;
    this.muteNode.gain.setTargetAtTime(
      value ? 0 : 1,
      this.mic.c.currentTime,
      0.01,
    );
  }

  peak: number = $state(0);
  rms: number = $state(0);

  constructor(
    targetId: string,
    mic: Mic,
    createLoudnessMeter: () => AudioWorkletNode,
  ) {
    this.mic = mic;
    this.pc = new RTCPeerConnection(ICE_CONFIG);
    this.gainNode = this.mic.c.createGain();
    this.analyzer = createLoudnessMeter();
    this.muteNode = this.mic.c.createGain();

    this.gainNode.connect(this.muteNode);
    this.muteNode.connect(this.analyzer);
    this.analyzer.connect(this.mic.c.destination);

    this.analyzer.port.onmessage = (event) => {
      this.peak = event.data.peak;
      this.rms = event.data.rms;
    };

    if (!this.mic.stream) {
      throw new Error("Local stream not available");
    }

    // Add local stream to peer connection
    const [audioTrack] = this.mic.nodes.destination.stream.getAudioTracks();
    this.pc.addTrack(audioTrack, this.mic.stream);

    /**
     * Attach a DOM audio element to a MediaStream
     * because chrome WOULD NOT behave without it
     * (data from the stream just doesn't get sent to the sink without it)
     */
    function attachDomAudio(id: string, stream: MediaStream) {
      let audio = document.getElementById(id) as HTMLAudioElement;

      if (!audio) {
        audio = document.createElement("audio");
        audio.id = id;
        audio.autoplay = true;
        audio.muted = true;
        audio.style.display = "none";
        document.body.appendChild(audio);
      }

      audio.srcObject = stream;
      return audio;
    }

    // Handle remote stream
    this.pc.ontrack = (event) => {
      console.log(
        "Received remote stream from:",
        targetId,
        `with ${event.streams.length} streams`,
      );
      for (const stream of event.streams) {
        console.log(`stream[${event.streams.indexOf(stream)}]:`, stream);
        for (const track of stream.getTracks()) {
          console.log(`    track[${track.id}]:`, track);
        }
      }

      const audioTrack = event.streams[0].getAudioTracks()[0];
      if (!audioTrack) {
        throw new Error(`Audio track for ${targetId} not found`);
      }

      const stream = event.streams[0];
      console.log("Received stream:", stream);
      const source = this.mic.c.createMediaStreamSource(stream);
      console.log("Source:", source);
      source.connect(this.gainNode);
      attachDomAudio("user-audio-" + targetId, stream);
      this.mic.c.resume();
    };

    // this will probably be needed for enabling cam
    // or bitrate changes?
    this.pc.onnegotiationneeded = async () => {
      console.log(`Negotiation needed for ${targetId}`);
    };
  }

  /**
   * After this the object should not be reused
   */
  cleanup() {
    this.pc.close();
    this.gainNode.disconnect();
    this.analyzer.disconnect();

    // @ts-expect-error
    delete this.pc;
  }
}

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

export class WebRTC {
  isConnected: boolean = $state(false);
  room: string = $state("");
  clientId: string;
  private mic: Mic;
  private gateway: Gateway;
  private audioContext: AudioContext;
  private createLoudnessMeter: () => AudioWorkletNode;
  peers = new SvelteMap<string, Peer>();
  users: Array<{ id: string; username?: string }> = $state([]);

  constructor(
    gateway: Gateway,
    mic: Mic,
    audioContext: AudioContext,
    createLoudnessMeter: () => AudioWorkletNode,
    clientId?: string,
  ) {
    this.gateway = gateway;
    this.mic = mic;
    this.audioContext = audioContext;
    this.createLoudnessMeter = createLoudnessMeter;
    this.clientId = Math.floor(Math.random() * 1000).toString();
    this.gateway.onmessage = (data) => {
      console.log("Received message:", data);
      this.handleSignalingMessage(data);
    };
  }

  async handleSignalingMessage(rawData: unknown) {
    const data = rawData as any;

    switch (data.type) {
      case "connected":
        this.clientId = data.id;
        console.log("Connected with ID:", this.clientId);
        break;

      case "room-joined":
        this.room = data.room;
        this.isConnected = true;
        this.users = data.users;
        console.log("Joined room:", this.room, "with users:", this.users);

        await this.mic.connect();
        // Initiate calls to existing users
        for (const user of this.users) {
          await this.initiateCall(user.id);
        }
        break;

      case "left-room":
        this.cleanup();
        break;

      case "user-joined":
        console.log("User joined:", data.userId, data.username);
        this.users.push({ id: data.userId, username: data.username });
        break;

      case "user-left":
        console.log("User left:", data.userId);
        this.users = this.users.filter((u) => u.id !== data.userId);

        // Close peer connection with this user
        const peer = this.peers.get(data.targetId);
        peer?.cleanup();
        this.peers.delete(data.targetId);
        break;

      case "offer":
        await this.acceptCall(data.offer, data.sender);
        break;

      case "answer":
        await this.handleAnswer(data.answer, data.sender);
        break;

      case "ice-candidate":
        await this.handleIceCandidate(data.candidate, data.sender);
        break;
    }
  }

  createPeer(targetId: string): Peer {
    let peer = this.peers.get(targetId);
    if (peer) {
      console.log(`Peer connection with ${targetId} already exists`);
      return peer;
    }
    peer = new Peer(targetId, this.mic, this.createLoudnessMeter);
    this.peers.set(targetId, peer);

    if (!this.mic.stream) {
      throw new Error("Local stream not available");
    }

    // Handle ICE candidates
    peer.pc.onicecandidate = (event) => {
      if (!event.candidate) {
        console.error("No ice candidate");
        return;
      }
      this.gateway.send({
        type: "ice-candidate",
        candidate: event.candidate,
        target: targetId,
        senderId: this.clientId,
      });
    };

    // Handle connection state changes
    peer.pc.onconnectionstatechange = () => {
      console.log(
        `Connection state with ${targetId}:`,
        peer.pc.connectionState,
      );
      if (
        peer.pc.connectionState === "disconnected" ||
        peer.pc.connectionState === "failed"
      ) {
        peer.cleanup();
        this.peers.delete(targetId);
      }
    };
    peer.pc.onicecandidateerror = (event) => {
      console.error("ICE candidate error:", event.errorText);
    };

    return peer;
  }

  async initiateCall(targetId: string) {
    if (!this.users.find((user) => user.id === targetId)) {
      console.error(`User ${targetId} not found`);
      return;
    }
    if (this.peers.has(targetId)) {
      console.error(`Already connected to ${targetId}`);
      return;
    }
    const peer = this.createPeer(targetId);

    let offer = await peer.pc.createOffer();
    // const sdp = setAudioMaxInSDP(offer.sdp, BITRATE, CHANNELS);
    // offer = { ...offer, sdp };
    await peer.pc.setLocalDescription(offer);

    this.gateway.send({
      type: "offer",
      offer: offer,
      target: targetId,
      senderId: this.clientId,
    });
  }

  async acceptCall(offer: RTCSessionDescriptionInit, senderId: string) {
    console.log("Received call from:", senderId);
    const peer = this.createPeer(senderId);

    await peer.pc.setRemoteDescription(offer);

    let answer = await peer.pc.createAnswer();
    // const sdp = setAudioMaxInSDP(answer.sdp, BITRATE, CHANNELS);
    // answer = { ...answer, sdp };
    await peer.pc.setLocalDescription(answer);

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

    const peer = this.peers.get(senderId);
    if (!peer) {
      console.error(`Peer for ${senderId} not found`);
      return;
    }
    await peer.pc.setRemoteDescription(answer);
  }

  async handleIceCandidate(candidate: RTCIceCandidateInit, senderId: string) {
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
    this.peers.clear();
    this.mic.disconnect();
    this.isConnected = false;
    this.users = [];
    this.room = "";
  }

  async joinRoom(username: string, room: string) {
    console.log("Joining room:", room, "with username:", username);
    if (this.isConnected) {
      this.leaveRoom();
      await (() => {
        return new Promise((resolve) => setTimeout(resolve, 1000));
      })();
    }
    this.gateway.send({
      type: "join-room",
      room: room.trim(),
      username: username.trim(),
      senderId: this.clientId,
    });
  }

  leaveRoom() {
    this.gateway.send({
      type: "leave-room",
      senderId: this.clientId,
    });
  }
}
