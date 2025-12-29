import { SvelteMap } from "svelte/reactivity";
import type { Message, Room } from "trurpchat-backend";
import type { Mic } from "./mic.svelte";
import type { God } from "./god.svelte";

export class Peer {
  mic: Mic;
  pc: RTCPeerConnection;
  analyzer: AudioWorkletNode;

  gainNode: GainNode;
  muteNode: GainNode;
  #volume: number = $state(1);
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

  speaking = $state(false);

  peak: number = $state(0);
  rms: number = $state(0);
  /** in ms */
  ping: number = $state(0);

  interval: NodeJS.Timeout | number | null = null;

  constructor(
    targetId: string,
    mic: Mic,
    createLoudnessMeter: () => AudioWorkletNode,
    output: GainNode,
  ) {
    this.mic = mic;
    this.pc = new RTCPeerConnection(ICE_CONFIG);
    this.gainNode = this.mic.c.createGain();
    this.analyzer = createLoudnessMeter();
    this.muteNode = this.mic.c.createGain();

    this.gainNode.connect(this.muteNode);
    this.muteNode.connect(this.analyzer);
    this.analyzer.connect(output);

    this.interval = setInterval(() => {
      this.pc.getStats().then((stats) => {
        stats.forEach((report) => {
          if (
            report.type === "candidate-pair" &&
            report.state === "succeeded" &&
            report.nominated === true
          ) {
            this.ping = report.currentRoundTripTime * 1000;
          }
        });
      });
    }, 1000);

    this.analyzer.port.onmessage = (event) => {
      this.peak = event.data.peak;
      this.rms = event.data.rms;
      // TODO: remove smoothing inside loudness.js
      // or send this data over a data channel with webrtc
      // based on gate state/ptt
      if (this.peak > -60) {
        this.speaking = true;
      } else {
        this.speaking = false;
      }
    };

    if (!this.mic.stream) {
      throw new Error("Local stream not available");
    }

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
    clearInterval(this.interval as number);

    // @ts-expect-error
    delete this.pc;
  }
}

const TURN_SERVER_IP = "45.143.95.55";
export const ICE_CONFIG = {
  iceServers: [
    { urls: ["stun:stun.l.google.com:19302"] },
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
  rooms: Room[] = $state([]);
  room: Room | null = $state(null);
  clientId: string;
  deafenNode: GainNode;
  peers = new SvelteMap<string, Peer>();
  connectedFor: number = $state(0);
  connectedTimeout: NodeJS.Timeout | null = null;

  #streaming: boolean = $state(false);
  get streaming() {
    return this.#streaming;
  }
  set streaming(value: boolean) {
    this.#streaming = value;
    this.g.ws.send({
      type: "streaming",
      streaming: value,
    });
  }

  #watching: string | null = $state(null);
  get watching() {
    return this.#watching;
  }
  set watching(value: string | null) {
    this.#watching = value;
    this.g.ws.send({
      type: "watching",
      watching: value,
    });
  }

  constructor(private g: God) {
    this.deafenNode = this.g.c.createGain();
    this.deafenNode.connect(this.g.c.destination);
    this.clientId = Math.floor(Math.random() * 1000).toString();
    this.g.ws.onmessage = (data) => {
      console.log("Received message:", data);
      this.handleSignalingMessage(data);
    };
  }

  async handleSignalingMessage(rawData: unknown) {
    const msg = rawData as Message;

    switch (msg.type) {
      case "connected":
        this.clientId = msg.id;
        console.log("Connected with ID:", this.clientId);
        break;

      case "rooms":
        this.rooms = msg.rooms;
        if (this.room) {
          const r = this.rooms.find((room) => room.name === this.room?.name);
          if (r) {
            this.room = r;
          }
        }
        console.log("Received rooms:", msg.rooms);
        break;

      case "joined":
        if (msg.user.id !== this.clientId) {
          console.log(`User ${msg.user.name} joined room`, msg.room);
          if (msg.room === this.room?.name) {
            this.g.sound.play("user join");
          }
          return;
        }
        this.g.sound.play("user join");
        const room = this.rooms.find((room) => room.name === msg.room);
        if (!room) {
          console.error("Room not found");
          return;
        }
        this.room = room;
        this.isConnected = true;
        console.log("Joined room:", this.room);

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
          if (user.id === this.clientId) continue;
          await this.initiateCall(user.id);
        }
        break;

      case "left":
        if (msg.user.id === this.clientId) {
          this.cleanup();
          return;
        } else {
          this.peers.get(msg.user.id)?.cleanup();
          this.peers.delete(msg.user.id);
          if (msg.room === this.room?.name) {
            this.g.sound.play("user leave");
          }
        }
        break;

      case "rtc.offer":
        await this.acceptCall(msg.offer, msg.sender!);
        break;

      case "rtc.answer":
        await this.handleAnswer(msg.answer, msg.sender!);
        break;

      case "rtc.ice":
        await this.handleIceCandidate(msg.candidate, msg.sender!);
        break;
    }

    if (msg.type.startsWith("rtc")) {
      return;
    }
    console.log("Peer connections:", this.peers.size, this.peers);
  }

  createPeer(targetId: string): Peer {
    let peer = this.peers.get(targetId);
    if (peer) {
      console.log(`Peer connection with ${targetId} already exists`);
      return peer;
    }
    peer = new Peer(
      targetId,
      this.g.mic,
      this.g.createLoudnessMeter,
      this.deafenNode,
    );
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
      this.g.ws.send({
        type: "rtc.ice",
        candidate: event.candidate,
        target: targetId,
        sender: this.clientId,
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
      console.warn("ICE candidate error:", event.errorText);
    };

    return peer;
  }

  async initiateCall(targetId: string) {
    if (!this.room?.users.find((user) => user.id === targetId)) {
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

    this.g.ws.send({
      type: "rtc.offer",
      offer: offer,
      target: targetId,
      sender: this.clientId,
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
    this.g.ws.send({
      type: "rtc.answer",
      answer: answer,
      target: senderId,
      sender: this.clientId,
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
    this.connectedFor = 0;
    if (this.connectedTimeout) {
      clearInterval(this.connectedTimeout);
    }
    this.connectedTimeout = null;
    this.peers.clear();
    this.g.mic.disconnect();
    this.isConnected = false;
    this.room = null;
  }

  async joinRoom(room: string) {
    const url = this.g.settings.settings.avtiveServerUrl;
    const server = this.g.settings.settings.servers.find((server) => server.url === url);
    if (!server) {
      console.error("Server not found");
      return;
    }
    const username = server.username;
    console.log("Joining room:", room, "with username:", username);
    if (this.isConnected) {
      this.leaveRoom();
      // await (() => {
      //   return new Promise((resolve) => setTimeout(resolve, 1000));
      // })();
    }
    this.g.ws.send({
      type: "join",
      room: room.trim(),
    });
  }

  leaveRoom() {
    if (!this.room) return;
    this.g.sound.play("voice disconnected");
    this.g.ws.send({
      type: "leave",
      room: this.room.name,
    });
  }
}
