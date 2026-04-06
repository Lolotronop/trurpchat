import {
  create as createOvenPlayer,
  type OvenPlayerIceServer,
  type OvenPlayerInstance,
  type OvenPlayerState,
} from "ovenplayer";
import { browser } from "$app/environment";
import { audioctx } from "$lib/audio/context";
import type { Headphones } from "$lib/headphones.svelte";
import type { Server } from "$lib/servers.svelte";

const DEFAULT_GAIN = 0.6;

type StreamPlayerState = "disconnected" | "loading" | "playing";

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

function toStreamPlayerState(state: OvenPlayerState): StreamPlayerState {
  if (state === "playing") {
    return "playing";
  }

  if (state === "error") {
    return "disconnected";
  }

  return "loading";
}

export class OvenPlayerController {
  audioSource: MediaStreamAudioSourceNode | undefined = $state(undefined);
  state: StreamPlayerState = $state("disconnected");
  gainnode: GainNode;
  host: HTMLElement | undefined = $state(undefined);

  #gain = $state(DEFAULT_GAIN);
  #watching = false;
  #stream: MediaStream | undefined;
  #rootEl: HTMLDivElement | undefined;
  #videoEl: HTMLVideoElement | undefined;
  #playerId: string;
  #player: OvenPlayerInstance | undefined;

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
    this.gainnode.gain.setTargetAtTime(value, audioctx().currentTime, 0.01);
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
    if (!browser || !this.server.overServerUrl || !this.server.iceConfig) {
      return;
    }

    this.#ensureElements();

    if (!this.#player) {
      this.#createPlayer();
      return;
    }

    this.state = "loading";
    this.#player.play();
  }

  stop() {
    this.#sendUnwatch();
    this.#disconnectAudio();
    this.state = "disconnected";
    this.#player?.stop();
  }

  destroy() {
    this.stop();
    this.#player?.remove();
    this.#player = undefined;
    this.#rootEl?.remove();
    this.#rootEl = undefined;
    this.#videoEl = undefined;
    this.headphones.removeSource(this.gainnode);
  }

  #createPlayer() {
    if (!browser || this.#player || !this.server.overServerUrl || !this.server.iceConfig) {
      return;
    }

    this.#ensureElements();

    this.state = "loading";
    this.#player = createOvenPlayer(this.#playerId, {
      volume: 0,
      disableSeekUI: true,
      expandFullScreenUI: false,
      controls: false,
      autoStart: true,
      showBigPlayButton: false,
      playbackRate: 1,
      playbackRates: [1],
      waterMark: undefined,
      title: "",
      webrtcConfig: {
        playoutDelayHint: 0,
        iceServers: this.server.iceConfig.iceServers as OvenPlayerIceServer[],
      },
      sources: [
        {
          type: "webrtc",
          file: `ws://${this.server.overServerUrl}/app/${this.server.definition.id}-${this.userId}`,
        },
      ],
    });

    this.#player.on("stateChanged", (event) => {
      this.state = toStreamPlayerState(event.newstate);

      if (event.newstate === "playing") {
        this.#syncAudio();
        this.#sendWatch();
        return;
      }

      if (event.newstate === "error") {
        this.#sendUnwatch();
        this.#disconnectAudio();
      }
    });
  }

  #syncAudio() {
    const mediaElement = this.#player?.getMediaElement();
    const stream = mediaElement?.srcObject;

    if (!(stream instanceof MediaStream) || stream === this.#stream) {
      return;
    }

    this.#disconnectAudio();
    this.#stream = stream;
    this.audioSource = audioctx().createMediaStreamSource(stream);
    this.audioSource.connect(this.gainnode);

    if (this.server.user.id === this.userId) {
      this.gain = 0;
    }
  }

  #disconnectAudio() {
    this.audioSource?.disconnect();
    this.audioSource = undefined;
    this.#stream = undefined;
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
    this.#videoEl.preload = "auto";
    this.#videoEl.className = "w-full h-full object-fit rounded-md";
    this.#rootEl.appendChild(this.#videoEl);
    getParkingLot().appendChild(this.#rootEl);
  }
}
