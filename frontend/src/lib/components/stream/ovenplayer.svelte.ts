import { browser } from "$app/environment";
import { audioctx } from "$lib/audio/context";
import { log } from "$lib/log";
import type { Headphones } from "$lib/headphones.svelte";
import type { Server } from "$lib/servers.svelte";

const DEFAULT_GAIN = 0.6;
const ICE_DISCONNECTED_WARN_AFTER_MS = 3000;

type StreamPlayerState = "disconnected" | "loading" | "playing";
type LogContext = Record<string, unknown>;

let parkingLot: HTMLDivElement | undefined;
let nextPlayerId = 0;

function getParkingLot() {
  if (!browser) {
    throw new Error("Cannot create OvenPlayer outside the browser");
  }

  if (parkingLot) {
    return parkingLot;
  }

  parkingLot = document.createElement("div");
  parkingLot.id = "oven-player-parking-lot";
  parkingLot.setAttribute("aria-hidden", "true");
  parkingLot.style.position = "fixed";
  parkingLot.style.width = "1px";
  parkingLot.style.height = "1px";
  parkingLot.style.overflow = "hidden";
  parkingLot.style.opacity = "0";
  parkingLot.style.pointerEvents = "none";
  parkingLot.style.left = "-9999px";
  parkingLot.style.top = "-9999px";
  document.body.appendChild(parkingLot);

  return parkingLot;
}

type OvenRequestOfferMessage = {
  command: "request_offer";
};

type OvenAnswerMessage = {
  id: string;
  peer_id?: number;
  command: "answer";
  sdp: RTCSessionDescriptionInit;
  candidates: RTCIceCandidate[];
};

type OvenCandidateMessage = {
  id: string;
  peer_id?: number;
  command: "candidate";
  candidates: RTCIceCandidate[];
};

type OvenStopMessage = {
  id: string;
  command: "stop";
};

type OvenSignalingMessage =
  | OvenRequestOfferMessage
  | OvenAnswerMessage
  | OvenCandidateMessage
  | OvenStopMessage;

type OvenOfferMessage = {
  id: string;
  peer_id?: number;
  code: 200;
  command?: "offer";
  ice_servers?: Array<RTCIceServer & { user_name?: string }>;
  sdp: RTCSessionDescriptionInit;
  candidates?: RTCIceCandidateInit[];
};

type OvenErrorMessage = {
  code: number;
  message?: string;
  reason?: string;
  error?: string;
};

function parseOvenMessage(
  data: string,
): OvenOfferMessage | OvenErrorMessage | undefined {
  try {
    const message = JSON.parse(data) as OvenOfferMessage | OvenErrorMessage;
    if ("code" in message && message.code !== 200) {
      return message;
    }
    if ("sdp" in message && message.id) {
      return message;
    }
  } catch (error) {
    log.warn("[OvenPlayer:signal-parse-failed]", { error });
  }
}

function normalizeIceServers(
  iceServers: OvenOfferMessage["ice_servers"] = [],
): RTCIceServer[] {
  return iceServers.map(({ user_name, ...server }) => ({
    ...server,
    username: server.username ?? user_name,
  }));
}

export class OvenPlayerController {
  audioSource: MediaStreamAudioSourceNode | undefined = $state(undefined);
  state: StreamPlayerState = $state("disconnected");
  gainnode: GainNode;
  host: HTMLElement | undefined = $state(undefined);

  #gain = $state(DEFAULT_GAIN);
  #lastAudibleGain = DEFAULT_GAIN;
  #watching = false;
  #stream: MediaStream | undefined;
  #rootEl: HTMLDivElement | undefined;
  #videoEl: HTMLVideoElement | undefined;
  #playerId: string;
  #ws: WebSocket | undefined;
  #closing = false;
  #pc: RTCPeerConnection | undefined;
  #omeSessionId: string | undefined;
  #omePeerId: number | undefined;
  #lastIceConnectionState: RTCIceConnectionState | undefined;
  #lastConnectionState: RTCPeerConnectionState | undefined;
  #iceDisconnectedTimeout: ReturnType<typeof setTimeout> | undefined;
  #reportedPlayingStream: MediaStream | undefined;

  constructor(
    public server: Server,
    public userId: number,
    public headphones: Headphones,
  ) {
    const ctx = audioctx();
    this.gainnode = ctx.createGain();
    this.gainnode.gain.setTargetAtTime(
      DEFAULT_GAIN,
      audioctx().currentTime,
      0.01,
    );
    headphones.addSource(this.gainnode);

    this.#playerId = `oven-player-${userId}-${nextPlayerId++}`;
  }

  get gain() {
    return this.#gain;
  }

  set gain(value: number) {
    this.#gain = value;
    if (value > 0) {
      this.#lastAudibleGain = value;
    }
    this.gainnode.gain.setTargetAtTime(value, audioctx().currentTime, 0.01);
  }

  setMuted(value: boolean) {
    if (value) {
      if (this.gain > 0) {
        this.#lastAudibleGain = this.gain;
      }
      this.gain = 0;
      return;
    }

    this.gain =
      this.#lastAudibleGain > 0 ? this.#lastAudibleGain : DEFAULT_GAIN;
  }

  toggleMuted() {
    this.setMuted(this.gain > 0);
  }

  #createLogContext(context: LogContext = {}) {
    return {
      selfUserId: this.server.user.id,
      targetId: this.userId,
      serverId: this.server.definition.id,
      playerId: this.#playerId,
      streamKey: `${this.server.definition.id}-${this.userId}`,
      state: this.state,
      watching: this.#watching,
      hasAudio: Boolean(this.audioSource),
      iceConnectionState: this.#pc?.iceConnectionState ?? null,
      connectionState: this.#pc?.connectionState ?? null,
      signalingState: this.#pc?.signalingState ?? null,
      wsReadyState: this.#ws?.readyState ?? null,
      ...context,
    };
  }

  #logDebug(event: string, context: LogContext = {}) {
    log.debug(`[OvenPlayer:${event}]`, this.#createLogContext(context));
  }

  #logInfo(event: string, context: LogContext = {}) {
    log.info(`[OvenPlayer:${event}]`, this.#createLogContext(context));
  }

  #logWarn(event: string, context: LogContext = {}) {
    log.warn(`[OvenPlayer:${event}]`, this.#createLogContext(context));
  }

  requestPictureInPicture() {
    if (!this.#videoEl || !this.#videoEl.srcObject) {
      this.#logWarn("picture-in-picture-blocked", {
        hasVideoElement: Boolean(this.#videoEl),
        hasStream: Boolean(this.#videoEl?.srcObject),
      });
      return;
    }

    void this.#videoEl.requestPictureInPicture().catch((error) => {
      this.#logWarn("picture-in-picture-failed", { error });
    });
  }

  mount(host: HTMLElement) {
    this.#ensureElements();
    this.host = host;

    if (this.#rootEl && this.#rootEl.parentElement !== host) {
      host.appendChild(this.#rootEl);
    }
  }

  unmount() {
    this.host = undefined;

    if (this.#rootEl && this.#rootEl.parentElement !== getParkingLot()) {
      getParkingLot().appendChild(this.#rootEl);
    }
  }

  start() {
    if (!browser || !this.server.overServerUrl) {
      this.#logWarn("start-blocked-missing-config", {
        browser,
        hasOvenServerUrl: Boolean(this.server.overServerUrl),
      });
      return;
    }

    this.stop({ sendStop: false, nextState: "loading" });
    this.#ensureElements();
    this.state = "loading";

    const protocol = import.meta.env.DEV ? "ws" : "wss";
    const url = `${protocol}://${this.server.overServerUrl}/app/${this.server.definition.id}-${this.userId}`;
    this.#logInfo("connect", { url });

    this.#ws = new WebSocket(url);
    this.#ws.onopen = () => {
      this.#logDebug("signal-open", {});
      this.#sendSignal({ command: "request_offer" });
    };
    this.#ws.onmessage = (event) => void this.#handleSignalMessage(event);
    this.#ws.onerror = () => {
      this.#logWarn("signal-error", {});
    };
    this.#ws.onclose = (event) => {
      if (this.#closing) {
        return;
      }

      this.#logWarn("signal-closed", {
        code: event.code,
        reason: event.reason,
        wasClean: event.wasClean,
      });
      this.#handleFatalDisconnect("signal-closed");
    };
  }

  stop(options: { sendStop?: boolean; nextState?: StreamPlayerState } = {}) {
    const { sendStop = true, nextState = "disconnected" } = options;
    this.#closing = true;
    this.#clearIceDisconnectedTimeout();
    this.#sendUnwatch();
    this.#disconnectAudio();

    if (
      sendStop &&
      this.#omeSessionId &&
      this.#ws?.readyState === WebSocket.OPEN
    ) {
      this.#sendSignal({ id: this.#omeSessionId, command: "stop" });
    }

    this.#ws?.close();
    this.#ws = undefined;
    this.#closing = false;
    this.#pc?.close();
    this.#pc = undefined;
    this.#omeSessionId = undefined;
    this.#omePeerId = undefined;
    this.#lastIceConnectionState = undefined;
    this.#lastConnectionState = undefined;
    this.#reportedPlayingStream = undefined;

    if (this.#videoEl) {
      this.#videoEl.srcObject = null;
    }

    if (this.state !== nextState) {
      this.state = nextState;
      this.#logInfo("stop", { nextState });
    }
  }

  destroy() {
    this.#logInfo("destroy", {});
    this.stop();
    this.#rootEl?.remove();
    this.#rootEl = undefined;
    this.#videoEl = undefined;
    this.headphones.removeSource(this.gainnode);
  }

  async #handleSignalMessage(event: MessageEvent<string>) {
    const message = parseOvenMessage(event.data);
    if (!message) {
      return;
    }

    if (message.code !== 200) {
      this.#logWarn("signal-error-response", message);
      this.#handleFatalDisconnect("signal-error-response");
      return;
    }

    if (!("sdp" in message)) {
      this.#logWarn("signal-offer-missing-sdp", message);
      this.#handleFatalDisconnect("signal-offer-missing-sdp");
      return;
    }

    await this.#handleOffer(message);
  }

  async #handleOffer(offer: OvenOfferMessage) {
    this.#omeSessionId = offer.id;
    this.#omePeerId = offer.peer_id;

    const iceServers = normalizeIceServers(offer.ice_servers);
    if (this.server.iceConfig?.iceServers) {
      iceServers.push(...this.server.iceConfig.iceServers);
    }

    this.#logInfo("offer-received", {
      omeSessionId: offer.id,
      omePeerId: offer.peer_id ?? null,
      remoteCandidateCount: offer.candidates?.length ?? 0,
      iceServerCount: iceServers.length,
      usingAppIceConfig: Boolean(this.server.iceConfig),
    });

    const pc = new RTCPeerConnection({ iceServers });
    this.#pc = pc;

    pc.onicecandidate = (iceEvent) => this.#handleLocalIceCandidate(iceEvent);
    pc.ontrack = (trackEvent) => this.#handleTrack(trackEvent);
    pc.onconnectionstatechange = () => this.#handleConnectionStateChange();
    pc.oniceconnectionstatechange = () =>
      this.#handleIceConnectionStateChange();
    pc.onicecandidateerror = (iceEvent) => {
      this.#logWarn("ice-candidate-error", {
        address: iceEvent.address,
        port: iceEvent.port,
        url: iceEvent.url,
        errorCode: iceEvent.errorCode,
        errorText: iceEvent.errorText,
      });
    };

    try {
      await pc.setRemoteDescription(offer.sdp);
      for (const candidate of offer.candidates ?? []) {
        await pc.addIceCandidate(candidate);
      }

      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      this.#sendSignal({
        id: offer.id,
        peer_id: offer.peer_id,
        command: "answer",
        sdp: answer,
        candidates: [],
      });
      this.#logDebug("answer-sent", { sdpLength: answer.sdp?.length ?? 0 });
    } catch (error) {
      this.#logWarn("offer-handle-failed", { error });
      this.#handleFatalDisconnect("offer-handle-failed");
    }
  }

  #handleLocalIceCandidate(event: RTCPeerConnectionIceEvent) {
    if (!event.candidate) {
      return;
    }

    if (!this.#omeSessionId) {
      this.#logWarn("local-ice-before-session-id", {});
      return;
    }

    this.#sendSignal({
      id: this.#omeSessionId,
      peer_id: this.#omePeerId,
      command: "candidate",
      candidates: [event.candidate],
    });
  }

  #handleTrack(event: RTCTrackEvent) {
    const stream = event.streams[0];
    if (!stream) {
      this.#logWarn("track-missing-stream", { kind: event.track.kind });
      return;
    }

    if (this.#videoEl && this.#videoEl.srcObject !== stream) {
      this.#videoEl.srcObject = stream;
    }

    if (stream !== this.#stream) {
      this.#attachAudio(stream);
    }

    void this.#videoEl?.play().catch((error) => {
      this.#logWarn("video-play-failed", { error });
    });
    this.#maybeMarkPlaying();
  }

  #maybeMarkPlaying() {
    const video = this.#videoEl;
    const stream = video?.srcObject;
    if (!(video && stream instanceof MediaStream)) {
      return;
    }

    const hasVideoTrack = stream.getVideoTracks().length > 0;
    const hasCurrentFrame =
      video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA;
    const hasDimensions = video.videoWidth > 0 && video.videoHeight > 0;

    if (!hasVideoTrack || !hasCurrentFrame || !hasDimensions) {
      return;
    }

    if (this.state === "playing" && this.#reportedPlayingStream === stream) {
      return;
    }

    this.#reportedPlayingStream = stream;
    this.state = "playing";
    this.#logInfo("playing", {
      audioTrackCount: stream.getAudioTracks().length,
      videoTrackCount: stream.getVideoTracks().length,
      videoWidth: video.videoWidth,
      videoHeight: video.videoHeight,
      readyState: video.readyState,
    });
    this.#sendWatch();
  }

  #handleConnectionStateChange() {
    const state = this.#pc?.connectionState;
    if (!state || state === this.#lastConnectionState) {
      return;
    }
    this.#lastConnectionState = state;

    if (state === "failed" || state === "closed") {
      this.#logWarn("connection-state-changed", { connectionState: state });
      this.#handleFatalDisconnect(`connection-${state}`);
      return;
    }

    this.#logDebug("connection-state-changed", { connectionState: state });
  }

  #handleIceConnectionStateChange() {
    const state = this.#pc?.iceConnectionState;
    if (!state || state === this.#lastIceConnectionState) {
      return;
    }
    this.#lastIceConnectionState = state;

    if (state === "disconnected") {
      this.#logWarn("ice-disconnected-grace-start", {
        graceMs: ICE_DISCONNECTED_WARN_AFTER_MS,
      });
      this.#clearIceDisconnectedTimeout();
      this.#iceDisconnectedTimeout = setTimeout(() => {
        if (this.#pc?.iceConnectionState === "disconnected") {
          this.#logWarn("ice-still-disconnected", {
            disconnectedForMs: ICE_DISCONNECTED_WARN_AFTER_MS,
          });
        }
      }, ICE_DISCONNECTED_WARN_AFTER_MS);
      return;
    }

    if (state === "connected" || state === "completed") {
      this.#clearIceDisconnectedTimeout();
      this.#logInfo("ice-connected", { iceConnectionState: state });
      return;
    }

    if (state === "failed" || state === "closed") {
      this.#logWarn("ice-failed", { iceConnectionState: state });
      this.#handleFatalDisconnect(`ice-${state}`);
      return;
    }

    this.#logDebug("ice-state-changed", { iceConnectionState: state });
  }

  #handleFatalDisconnect(reason: string) {
    if (!this.#pc && !this.#ws) {
      return;
    }

    this.#logWarn("fatal-disconnect", { reason });
    this.stop({ sendStop: false });
  }

  #attachAudio(stream: MediaStream) {
    if (stream === this.#stream) {
      return;
    }

    this.#disconnectAudio();
    this.#stream = stream;

    if (stream.getAudioTracks().length > 0) {
      this.audioSource = audioctx().createMediaStreamSource(stream);
      this.audioSource.connect(this.gainnode);
    }

    this.#logInfo("audio-attached", {
      audioTrackCount: stream.getAudioTracks().length,
      videoTrackCount: stream.getVideoTracks().length,
    });

    if (this.server.user.id === this.userId) {
      this.gain = 0;
    }
  }

  #disconnectAudio() {
    if (!this.audioSource && !this.#stream) {
      return;
    }

    this.audioSource?.disconnect();
    this.audioSource = undefined;
    this.#stream = undefined;
    this.#reportedPlayingStream = undefined;
    this.#logInfo("audio-disconnected", {});
  }

  #sendWatch() {
    if (this.#watching || !this.server.connected) {
      return;
    }

    this.server.gateway.send({
      type: "action.voice.watch",
      userId: this.userId,
    });
    this.#watching = true;
    this.#logDebug("watch-sent", {});
  }

  #sendUnwatch() {
    if (!this.#watching) {
      return;
    }

    this.#watching = false;
    if (!this.server.connected) {
      return;
    }

    this.server.gateway.send({
      type: "action.voice.unwatch",
      userId: this.userId,
    });
    this.#logDebug("unwatch-sent", {});
  }

  #sendSignal(message: OvenSignalingMessage) {
    if (this.#ws?.readyState !== WebSocket.OPEN) {
      this.#logWarn("signal-send-blocked", { command: message.command });
      return;
    }

    this.#ws.send(JSON.stringify(message));
  }

  #clearIceDisconnectedTimeout() {
    if (!this.#iceDisconnectedTimeout) {
      return;
    }

    clearTimeout(this.#iceDisconnectedTimeout);
    this.#iceDisconnectedTimeout = undefined;
  }

  #ensureElements() {
    if (!browser || this.#rootEl || this.#videoEl) {
      return;
    }

    this.#rootEl = document.createElement("div");
    this.#rootEl.className = "h-full w-full rounded-md overflow-hidden";
    this.#videoEl = document.createElement("video");
    this.#videoEl.id = this.#playerId;
    this.#videoEl.autoplay = true;
    this.#videoEl.muted = true;
    this.#videoEl.playsInline = true;
    this.#videoEl.preload = "auto";
    this.#videoEl.className = "w-full h-full object-fit rounded-md";
    this.#videoEl.onloadeddata = () => this.#maybeMarkPlaying();
    this.#videoEl.onplaying = () => this.#maybeMarkPlaying();
    this.#videoEl.onresize = () => this.#maybeMarkPlaying();
    this.#videoEl.onstalled = () => {
      this.#logWarn("video-stalled", {
        readyState: this.#videoEl?.readyState ?? null,
        networkState: this.#videoEl?.networkState ?? null,
      });
    };
    this.#videoEl.onwaiting = () => {
      this.#logWarn("video-waiting", {
        readyState: this.#videoEl?.readyState ?? null,
        networkState: this.#videoEl?.networkState ?? null,
      });
    };
    this.#rootEl.appendChild(this.#videoEl);
    getParkingLot().appendChild(this.#rootEl);
  }
}
