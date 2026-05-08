import { tick } from "svelte";
import { SvelteMap } from "svelte/reactivity";
import type { Message, VoiceChat } from "trurpchat-shared";
import { log } from "$lib/log";
import type { Camera } from "./camera.svelte";
import { OvenPlayerController } from "./components/stream/ovenplayer.svelte";
import type { Headphones } from "./headphones.svelte";
import type { Mic } from "./mic.svelte";
import type { Server } from "./servers.svelte";
import { sound } from "./sound.svelte";
import { debounce } from "./utils.svelte";
import type { PeerState } from "./webrtc-peer.svelte";
import { Peer } from "./webrtc-peer.svelte";
import { getPlatformStore, type IPersistantStore } from "./webstore";

type LogContext = Record<string, unknown>;

export class WebRTC {
  peers = new SvelteMap<number, Peer>();
  streamPlayers = new SvelteMap<number, OvenPlayerController>();
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
    const previousValue = this.#streaming;
    this.logInfo("streaming-set-request", {
      previousValue,
      nextValue: value,
    });

    this.#streaming = value;
    this.server.gateway.send({
      type: "action.user.state",
      streaming: value,
    });

    this.logInfo("streaming-state-sent", {
      previousValue,
      nextValue: value,
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
    } catch (error) {
      log.error(
        "[WebRTC:camera-toggle-failed] Failed to toggle camera state",
        this.createLogContext({
          nextValue: value,
          error,
        }),
      );
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
    this.logInfo("constructed", {
      serverId: this.server.definition.id,
      storeType: this.store.constructor.name,
    });

    this.mic.onSpeakingChange((speaking) => {
      const effectiveSpeaking = speaking && !this.mic.muted;
      for (const peer of this.peers.values()) {
        peer.sendData({
          type: "speaking",
          speaking: effectiveSpeaking,
        });
      }
    });
  }

  private createLogContext(context: LogContext = {}) {
    return {
      selfUserId: this.server.user.id,
      roomId: this.room?.id ?? null,
      peerCount: this.peers.size,
      streamPlayerCount: this.streamPlayers.size,
      cameraEnabled: this.#cameraEnabled,
      streaming: this.#streaming,
      ...context,
    };
  }

  private logTrace(event: string, context: LogContext = {}) {
    log.trace(`[WebRTC:${event}]`, this.createLogContext(context));
  }

  private logDebug(event: string, context: LogContext = {}) {
    log.debug(`[WebRTC:${event}]`, this.createLogContext(context));
  }

  private logInfo(event: string, context: LogContext = {}) {
    log.info(`[WebRTC:${event}]`, this.createLogContext(context));
  }

  private describeSessionDescription(description: RTCSessionDescriptionInit) {
    return {
      type: description.type ?? "unknown",
      sdpLength: description.sdp?.length ?? 0,
    };
  }

  private describeIceCandidate(candidate: RTCIceCandidateInit) {
    return {
      candidate: candidate.candidate ?? null,
      sdpMid: candidate.sdpMid ?? null,
      sdpMLineIndex: candidate.sdpMLineIndex ?? null,
      usernameFragment: candidate.usernameFragment ?? null,
    };
  }

  connect(room: VoiceChat) {
    this.logInfo("connect-room-selected", {
      nextRoomId: room.id,
      nextRoomUserIds: [...room.users],
      previousRoomId: this.room?.id ?? null,
    });
    this.room = room;
  }

  async handleSignalingMessage(msg: Message) {
    if (msg.type === "event.voice.joined") {
      this.logDebug("signal-dispatch-voice-joined", {
        joinedUserId: msg.userId,
        joinedRoomId: msg.room,
      });
      this.handleUserJoined(msg.userId, msg.room);
    } else if (msg.type === "event.voice.left") {
      this.logDebug("signal-dispatch-voice-left", {
        leftUserId: msg.userId,
        leftRoomId: msg.room,
      });
      this.handleUserLeft(msg.userId, msg.room);
    } else if (msg.type === "rtc.offer") {
      this.logInfo("signal-dispatch-offer", {
        senderId: msg.sender,
        offer: this.describeSessionDescription(msg.offer),
      });
      await this.handleRemoteDescription(msg.offer, msg.sender);
    } else if (msg.type === "rtc.answer") {
      this.logInfo("signal-dispatch-answer", {
        senderId: msg.sender,
        answer: this.describeSessionDescription(msg.answer),
      });
      await this.handleRemoteDescription(msg.answer, msg.sender);
    } else if (msg.type === "rtc.ice") {
      this.logTrace("signal-dispatch-ice", {
        senderId: msg.sender,
        candidate: this.describeIceCandidate(msg.candidate),
      });
      await this.handleIceCandidate(msg.candidate, msg.sender);
    }
  }

  async handleUserJoined(userId: number, roomId: number) {
    this.logInfo("voice-join-event-received", {
      joinedUserId: userId,
      eventRoomId: roomId,
    });

    if (this.room?.id !== roomId) {
      this.logDebug("voice-join-ignored-room-mismatch", {
        joinedUserId: userId,
        eventRoomId: roomId,
        activeRoomId: this.room?.id ?? null,
      });
      return;
    }

    sound.play("user join");

    if (userId !== this.server.user.id) {
      this.logInfo("voice-join-remote-user-observed", { joinedUserId: userId });
      return;
    }

    this.logInfo("voice-join-self-confirmed", {
      roomUserIds: [...this.room.users],
    });

    this.connectedFor = 0;
    if (this.connectedTimeout) {
      this.logDebug("connected-timer-reset", {
        hadExistingTimer: true,
      });
      clearInterval(this.connectedTimeout);
    }
    this.connectedTimeout = setInterval(() => {
      this.connectedFor += 1000;
    }, 1000);

    this.logInfo("mic-enable-requested-for-room-join", {});
    await this.mic.enable();
    this.logInfo("mic-enabled-for-room-join", {
      hasMicStream: Boolean(this.mic.stream),
      hasMicOutputStream: Boolean(this.mic.output.stream),
    });

    for (const existingUserId of this.room.users) {
      if (existingUserId === this.server.user.id) {
        this.logTrace("call-initiation-skip-self", {
          targetId: existingUserId,
        });
        continue;
      }

      this.logInfo("call-initiation-for-existing-room-member", {
        targetId: existingUserId,
      });
      await this.initiateCall(existingUserId);
    }
  }

  async handleUserLeft(userId: number, roomId: number) {
    this.logInfo("voice-leave-event-received", {
      leftUserId: userId,
      eventRoomId: roomId,
    });

    if (this.room?.id !== roomId) {
      this.logDebug("voice-leave-ignored-room-mismatch", {
        leftUserId: userId,
        eventRoomId: roomId,
        activeRoomId: this.room?.id ?? null,
      });
      return;
    }

    if (userId === this.server.user.id) {
      this.logInfo("voice-leave-self-confirmed-cleanup-start", {
        leftUserId: userId,
      });
      this.cleanup();
      return;
    }

    const player = this.streamPlayers.get(userId);
    if (player) {
      this.logInfo("stream-player-destroy-for-remote-leave", {
        targetId: userId,
      });
      player.destroy();
      this.streamPlayers.delete(userId);
    } else {
      this.logDebug("stream-player-missing-for-remote-leave", {
        targetId: userId,
      });
    }

    const peer = this.peers.get(userId);
    if (!peer) {
      this.logWarn("peer-missing-for-remote-leave", { targetId: userId });
      return;
    }

    this.logInfo("peer-cleanup-for-remote-leave", { targetId: userId });
    peer.cleanup();
    this.peers.delete(userId);
    sound.play("user leave");
    this.logDebug("voice-leave-sound-played", { leftUserId: userId });
  }

  private logWarn(event: string, context: LogContext = {}) {
    log.warn(`[WebRTC:${event}]`, this.createLogContext(context));
  }

  getPeerStorageKey(targetId: number) {
    const serverId = this.server.definition.id;
    if (serverId === null) {
      this.logWarn("peer-storage-key-missing-server-id", { targetId });
      return undefined;
    }

    const key = `${serverId}-${targetId}`;
    this.logTrace("peer-storage-key-created", { targetId, key, serverId });
    return key;
  }

  getStreamPlayer(userId: number) {
    let player = this.streamPlayers.get(userId);

    if (!player) {
      this.logInfo("stream-player-create-scheduled", { targetId: userId });
      tick().then(() => {
        this.logInfo("stream-player-create-executing", { targetId: userId });
        player = new OvenPlayerController(this.server, userId, this.headphones);
        this.streamPlayers.set(userId, player);
        this.logInfo("stream-player-created", { targetId: userId });
      });
    } else {
      this.logTrace("stream-player-reused", { targetId: userId });
    }

    return player;
  }

  getPeerStatePersister(key: string) {
    let persist = this.persistPeerState.get(key);
    if (persist) {
      this.logTrace("peer-state-persister-reused", { key });
      return persist;
    }

    this.logInfo("peer-state-persister-created", { key });
    persist = debounce((state: PeerState) => {
      this.logTrace("peer-state-persist-write", { key, state });
      this.store.set(key, state);
    });
    this.persistPeerState.set(key, persist);
    return persist;
  }

  private async negotiatePeer(
    peer: Peer,
    targetId: number,
    eventType: string,
  ) {
    this.logInfo("peer-negotiation-needed", {
      targetId,
      eventType,
      signalingState: peer.pc.signalingState,
      makingOffer: peer.makingOffer,
    });

    if (peer.makingOffer) {
      peer.needsNegotiation = true;
      this.logDebug("peer-negotiation-deferred-making-offer", {
        targetId,
      });
      return;
    }

    if (peer.pc.signalingState !== "stable") {
      peer.needsNegotiation = true;
      this.logDebug("peer-negotiation-deferred-non-stable", {
        targetId,
        signalingState: peer.pc.signalingState,
      });
      return;
    }

    try {
      peer.needsNegotiation = false;
      peer.makingOffer = true;
      await peer.pc.setLocalDescription();
      const description = peer.pc.localDescription;

      if (!description) {
        this.logWarn("peer-negotiation-missing-local-description", {
          targetId,
        });
        return;
      }

      if (description.type !== "offer") {
        this.logWarn("peer-negotiation-produced-non-offer", {
          targetId,
          localDescription: this.describeSessionDescription(description),
        });
        return;
      }

      this.server.gateway.send({
        type: "rtc.offer",
        offer: description,
        target: targetId,
        sender: this.server.user.id,
      });
      this.logInfo("peer-offer-sent-from-negotiation", {
        targetId,
        offer: this.describeSessionDescription(description),
        transceivers: peer.describeTransceivers(),
      });
    } catch (error) {
      log.error(
        "[WebRTC:peer-negotiation-needed-failed] Failed to negotiate peer",
        this.createLogContext({
          targetId,
          signalingState: peer.pc.signalingState,
          error,
        }),
      );
    } finally {
      peer.makingOffer = false;
    }
  }

  private async flushDeferredNegotiation(peer: Peer) {
    if (!peer.needsNegotiation || peer.pc.signalingState !== "stable") {
      return;
    }

    this.logDebug("peer-negotiation-flushing-deferred", {
      targetId: peer.targetId,
    });
    await this.negotiatePeer(peer, peer.targetId, "deferred");
  }

  async createPeer(targetId: number): Promise<Peer> {
    this.logInfo("peer-create-requested", { targetId });

    let peer = this.peers.get(targetId);
    if (peer) {
      this.logInfo("peer-create-reused-existing-peer", { targetId });
      return peer;
    }
    if (!this.server.iceConfig) {
      const error = new Error("ICE config not loaded for server");
      log.error(
        "[WebRTC:peer-create-missing-ice-config] Cannot create peer without ICE configuration",
        this.createLogContext({ targetId, error }),
      );
      throw error;
    }

    const key = this.getPeerStorageKey(targetId);
    const initialState = key ? await this.store.get<PeerState>(key) : undefined;
    this.logInfo("peer-create-state-loaded", {
      targetId,
      storageKey: key ?? null,
      hasInitialState: Boolean(initialState),
      initialState,
    });

    peer = new Peer(
      targetId,
      this.server.user.id,
      this.mic.output.stream,
      this.headphones,
      this.server.iceConfig,
      initialState,
      (state) => {
        this.logTrace("peer-state-change-observed", {
          targetId,
          state,
          storageKey: key ?? null,
        });
        if (!key) {
          this.logWarn("peer-state-persist-skipped-missing-key", {
            targetId,
            state,
          });
          return;
        }

        this.getPeerStatePersister(key)(state);
      },
    );
    this.peers.set(targetId, peer);
    this.logInfo("peer-created", {
      targetId,
      audioTrackCount: this.mic.output.stream.getAudioTracks().length,
    });

    if (!this.mic.stream) {
      const error = new Error("Local stream not available");
      log.error(
        "[WebRTC:peer-create-missing-local-stream] Local microphone stream missing after peer creation",
        this.createLogContext({ targetId, error }),
      );
      throw error;
    }

    peer.pc.onicecandidate = (event) => {
      if (!event.candidate) {
        this.logTrace("peer-ice-candidate-gathering-complete", { targetId });
        return;
      }

      this.logTrace("peer-ice-candidate-generated", {
        targetId,
        candidate: this.describeIceCandidate(event.candidate.toJSON()),
      });
      this.server.gateway.send({
        type: "rtc.ice",
        candidate: event.candidate,
        target: targetId,
        sender: this.server.user.id,
      });
      this.logTrace("peer-ice-candidate-sent", {
        targetId,
        candidate: this.describeIceCandidate(event.candidate.toJSON()),
      });
    };

    peer.pc.onconnectionstatechange = () => {
      this.logInfo("peer-connection-state-changed", {
        targetId,
        connectionState: peer.pc.connectionState,
        iceConnectionState: peer.pc.iceConnectionState,
        signalingState: peer.pc.signalingState,
      });

      if (
        peer.pc.connectionState === "disconnected" ||
        peer.pc.connectionState === "failed"
      ) {
        if (peer.pc.connectionState === "failed") {
          log.error(
            "[WebRTC:peer-connection-failed] Peer connection entered failed state",
            this.createLogContext({
              targetId,
              connectionState: peer.pc.connectionState,
              iceConnectionState: peer.pc.iceConnectionState,
              signalingState: peer.pc.signalingState,
            }),
          );
        }

        this.logInfo("peer-cleanup-after-terminal-connection-state", {
          targetId,
          connectionState: peer.pc.connectionState,
        });
        peer.cleanup();
        this.peers.delete(targetId);
      }
    };

    peer.pc.onicecandidateerror = (event) => {
      log.warn(
        "[WebRTC:peer-ice-candidate-error] ICE candidate gathering reported an error",
        this.createLogContext({
          targetId,
          address: event.address,
          errorCode: event.errorCode,
          errorText: event.errorText,
          port: event.port,
          url: event.url,
        }),
      );
    };

    peer.pc.onnegotiationneeded = async (event) => {
      await this.negotiatePeer(peer, targetId, event.type);
    };

    if (this.cameraStream) {
      const [cameraTrack] = this.cameraStream.getVideoTracks();
      if (cameraTrack) {
        await peer.setLocalCameraTrack(cameraTrack, this.cameraStream);
        this.logInfo("peer-camera-track-set-during-create", {
          targetId,
          cameraTrackId: cameraTrack.id,
          cameraTrackState: cameraTrack.readyState,
        });
      } else {
        this.logWarn("peer-camera-stream-missing-video-track", { targetId });
      }
    } else {
      this.logTrace("peer-create-no-camera-stream-to-attach", { targetId });
    }

    return peer;
  }

  async initiateCall(targetId: number) {
    this.logInfo("call-initiate-requested", { targetId });

    if (!this.room?.users.includes(targetId)) {
      log.error(
        "[WebRTC:call-initiate-target-missing-from-room] Cannot initiate call because target user is not in the active room",
        this.createLogContext({
          targetId,
          roomUserIds: this.room?.users ?? [],
        }),
      );
      return;
    }
    if (this.peers.has(targetId)) {
      log.warn(
        "[WebRTC:call-initiate-peer-already-exists] Skipping call initiation because a peer already exists",
        this.createLogContext({ targetId }),
      );
      return;
    }
    const peer = await this.createPeer(targetId);
    const chan = peer.pc.createDataChannel("speaking");
    this.logInfo("call-datachannel-created", {
      targetId,
      label: chan.label,
      readyState: chan.readyState,
    });
    peer.setDatachannel(chan);

    this.logInfo("call-awaiting-negotiation-needed", {
      targetId,
      signalingState: peer.pc.signalingState,
    });
  }

  async handleRemoteDescription(
    description: RTCSessionDescriptionInit,
    senderId: number,
  ) {
    this.logInfo("remote-description-handle-requested", {
      senderId,
      description: this.describeSessionDescription(description),
    });

    let peer = this.peers.get(senderId);
    if (!peer) {
      if (description.type !== "offer") {
        log.error(
          "[WebRTC:remote-description-peer-missing] Cannot apply non-offer description because the peer does not exist",
          this.createLogContext({
            senderId,
            description: this.describeSessionDescription(description),
          }),
        );
        return;
      }

      peer = await this.createPeer(senderId);
    }

    const readyForOffer =
      !peer.makingOffer &&
      (peer.pc.signalingState === "stable" ||
        peer.isSettingRemoteAnswerPending);
    const offerCollision = description.type === "offer" && !readyForOffer;

    peer.ignoreOffer = !peer.polite && offerCollision;
    if (peer.ignoreOffer) {
      this.logWarn("remote-offer-ignored-due-to-collision", {
        senderId,
        polite: peer.polite,
        signalingState: peer.pc.signalingState,
        makingOffer: peer.makingOffer,
        isSettingRemoteAnswerPending: peer.isSettingRemoteAnswerPending,
      });
      return;
    }

    try {
      peer.isSettingRemoteAnswerPending = description.type === "answer";
      await peer.pc.setRemoteDescription(description);
      peer.isSettingRemoteAnswerPending = false;

      this.logInfo("remote-description-applied", {
        senderId,
        polite: peer.polite,
        remoteDescription: this.describeSessionDescription(
          peer.pc.remoteDescription ?? description,
        ),
        signalingState: peer.pc.signalingState,
        transceivers: peer.describeTransceivers(),
      });

      await this.flushPendingIceCandidates(peer);

      if (description.type !== "offer") {
        await this.flushDeferredNegotiation(peer);
        return;
      }

      await peer.pc.setLocalDescription();
      const answer = peer.pc.localDescription;
      if (!answer || answer.type !== "answer") {
        this.logWarn("remote-offer-answer-missing", {
          senderId,
          localDescription: answer
            ? this.describeSessionDescription(answer)
            : null,
        });
        return;
      }

      this.server.gateway.send({
        type: "rtc.answer",
        answer,
        target: senderId,
        sender: this.server.user.id,
      });
      this.logInfo("remote-offer-answer-sent", {
        senderId,
        answer: this.describeSessionDescription(answer),
        transceivers: peer.describeTransceivers(),
      });
      await this.flushDeferredNegotiation(peer);
    } catch (error) {
      peer.isSettingRemoteAnswerPending = false;
      log.error(
        "[WebRTC:remote-description-handle-failed] Failed to apply remote description",
        this.createLogContext({
          senderId,
          polite: peer.polite,
          description: this.describeSessionDescription(description),
          signalingState: peer.pc.signalingState,
          error,
        }),
      );
    }
  }

  private async flushPendingIceCandidates(peer: Peer) {
    if (!peer.pc.remoteDescription || peer.pendingIceCandidates.length === 0) {
      return;
    }

    const pending = peer.pendingIceCandidates.splice(0);
    this.logDebug("ice-pending-flush-started", {
      senderId: peer.targetId,
      candidateCount: pending.length,
    });

    for (const candidate of pending) {
      await this.addIceCandidate(peer, candidate);
    }
  }

  private async addIceCandidate(peer: Peer, candidate: RTCIceCandidateInit) {
    try {
      await peer.pc.addIceCandidate(candidate);
      this.logTrace("ice-candidate-added", {
        senderId: peer.targetId,
        candidate: this.describeIceCandidate(candidate),
      });
    } catch (error) {
      if (peer.ignoreOffer) {
        this.logDebug("ice-candidate-ignored-for-ignored-offer", {
          senderId: peer.targetId,
          candidate: this.describeIceCandidate(candidate),
        });
        return;
      }

      log.error(
        "[WebRTC:ice-candidate-add-failed] Failed to add ICE candidate",
        this.createLogContext({
          senderId: peer.targetId,
          candidate: this.describeIceCandidate(candidate),
          error,
        }),
      );
    }
  }

  async handleIceCandidate(candidate: RTCIceCandidateInit, senderId: number) {
    this.logTrace("ice-handle-requested", {
      senderId,
      candidate: this.describeIceCandidate(candidate),
    });
    const peer = this.peers.get(senderId);
    if (!peer) {
      log.error(
        "[WebRTC:ice-handle-peer-missing] Cannot add ICE candidate because the peer does not exist",
        this.createLogContext({
          senderId,
          candidate: this.describeIceCandidate(candidate),
        }),
      );
      return;
    }

    if (!peer.pc.remoteDescription) {
      peer.pendingIceCandidates.push(candidate);
      this.logTrace("ice-candidate-queued-until-remote-description", {
        senderId,
        queuedCandidateCount: peer.pendingIceCandidates.length,
        candidate: this.describeIceCandidate(candidate),
      });
      return;
    }

    await this.addIceCandidate(peer, candidate);
  }

  async enableCamera() {
    this.logInfo("camera-enable-requested", {
      hadExistingStream: Boolean(this.cam.stream),
    });
    await this.cam.enable();
    const stream = this.cam.stream;
    if (!stream) {
      this.logWarn("camera-enable-no-stream-returned", {});
      return;
    }

    const [videoTrack] = stream.getVideoTracks();
    this.logInfo("camera-enable-stream-ready", {
      streamId: stream.id,
      videoTrackId: videoTrack?.id ?? null,
      videoTrackState: videoTrack?.readyState ?? null,
      peerIds: Array.from(this.peers.keys()),
    });

    if (!videoTrack) {
      this.logWarn("camera-enable-stream-without-video-track", {
        streamId: stream.id,
      });
      return;
    }

    for (const peer of this.peers.values()) {
      await peer.setLocalCameraTrack(videoTrack, stream);
      this.logInfo("camera-track-set-on-peer", {
        targetId: peer.targetId,
        videoTrackId: videoTrack.id,
        transceivers: peer.describeTransceivers(),
      });
    }
  }

  disableCamera() {
    const stream = this.cam.stream;
    if (!stream) {
      this.logDebug("camera-disable-no-stream-present", {});
      return;
    }

    this.logInfo("camera-disable-requested", {
      streamId: stream.id,
      videoTrackIds: stream.getVideoTracks().map((track) => track.id),
      peerIds: Array.from(this.peers.keys()),
    });
    for (const peer of this.peers.values()) {
      void peer.clearLocalCameraTrack().catch((error) => {
        log.error(
          "[WebRTC:camera-track-clear-failed] Failed to clear local camera track from peer",
          this.createLogContext({
            targetId: peer.targetId,
            error,
          }),
        );
      });
    }
    this.cam.disable();
    this.logInfo("camera-disabled", {
      previousStreamId: stream.id,
    });
  }

  cleanup() {
    this.logInfo("cleanup-started", {
      streamPlayerIds: Array.from(this.streamPlayers.keys()),
      peerIds: Array.from(this.peers.keys()),
      connectedForMs: this.connectedFor,
      hasConnectedTimer: Boolean(this.connectedTimeout),
    });

    for (const [userId, player] of this.streamPlayers.entries()) {
      this.logTrace("cleanup-destroy-stream-player", { targetId: userId });
      player.destroy();
    }
    this.streamPlayers.clear();

    for (const [userId, peer] of this.peers.entries()) {
      this.logTrace("cleanup-destroy-peer", { targetId: userId });
      peer.cleanup();
    }
    this.peers.clear();

    this.connectedFor = 0;
    if (this.connectedTimeout) {
      clearInterval(this.connectedTimeout);
      this.logDebug("cleanup-connected-timer-cleared", {});
    }
    this.connectedTimeout = null;
    this.room = undefined;

    this.logInfo("cleanup-disabling-local-media", {});
    this.mic.disable();
    this.cam.disable();
    this.camera = false;
    this.streaming = false;
    this.logInfo("cleanup-finished", {
      connectedForMs: this.connectedFor,
      activeRoomId: null,
    });
  }
}
