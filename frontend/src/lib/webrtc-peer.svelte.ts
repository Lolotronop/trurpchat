import type { IceConfig } from "trurpchat-backend";
import { log } from "$lib/log";
import { audioctx } from "./audio/context";
import type { Headphones } from "./headphones.svelte";

type DatachannelMessage = {
  type: "speaking";
  speaking: boolean;
};

export type PeerState = {
  gain: number;
  mute: boolean;
};

type PeerStateField = keyof PeerState;

export class Peer {
  pc: RTCPeerConnection;
  datachannel: RTCDataChannel | null = null;
  cameraStream: MediaStream | undefined = $state(undefined);

  gainNode: GainNode;
  muteNode: GainNode;
  source: MediaStreamAudioSourceNode | null = null;
  #volume: number = $state(1);
  get volume(): number {
    return this.#volume;
  }
  set volume(value: number) {
    this.#volume = value;
    this.gainNode.gain.setTargetAtTime(value, audioctx().currentTime, 0.01);
    this.onStateChange?.(this.getState(), "gain");
  }

  #mute = $state(false);
  get mute(): boolean {
    return this.#mute;
  }
  set mute(value: boolean) {
    this.#mute = value;
    this.muteNode.gain.setTargetAtTime(
      value ? 0 : 1,
      audioctx().currentTime,
      0.01,
    );
    this.onStateChange?.(this.getState(), "mute");
  }

  speaking = $state(false);

  /** in ms */
  ping: number = $state(0);

  interval: NodeJS.Timeout | number | null = null;

  constructor(
    public targetId: number,
    audioStream: MediaStream,
    public headphones: Headphones,
    iceConfig: IceConfig,
    initialState?: Partial<PeerState>,
    private onStateChange?: (
      state: PeerState,
      changedField: PeerStateField,
    ) => void,
  ) {
    this.pc = new RTCPeerConnection(iceConfig as RTCConfiguration);
    this.gainNode = audioctx().createGain();
    this.muteNode = audioctx().createGain();

    this.gainNode.connect(this.muteNode);
    this.headphones.addSource(this.muteNode);

    this.#volume = initialState?.gain ?? 1;
    this.#mute = initialState?.mute ?? false;
    this.gainNode.gain.value = this.#volume;
    this.muteNode.gain.value = this.#mute ? 0 : 1;

    this.interval = setInterval(() => this.updatePing(), 1000);

    const [audioTrack] = audioStream.getAudioTracks();
    this.pc.addTrack(audioTrack, audioStream);

    this.pc.ontrack = (event) => {
      this.handleOntrack(event);
    };
    this.pc.ondatachannel = (event) => {
      this.setDatachannel(event.channel);
    };

    // since Svelte doesn't save state between HMR updates
    // we need to cleanup the object when the file changes
    // https://github.com/sveltejs/svelte/issues/14434
    if (import.meta.hot) {
      import.meta.hot.on("vite:beforeUpdate", () => {
        this.cleanup();
      });
    }
  }

  async updatePing() {
    const stats = await this.pc.getStats();
    stats.forEach((report) => {
      if (
        report.type === "candidate-pair" &&
        report.state === "succeeded" &&
        report.nominated === true
      ) {
        this.ping = report.currentRoundTripTime * 1000;
      }
    });
  }

  handleOntrack(event: RTCTrackEvent) {
    event.streams.forEach((stream) => {
      stream.getTracks().forEach((track) => {
        if (track.kind === "audio") {
          this.handleAudioTrack(stream);
        }
        if (track.kind === "video") {
          this.handleVideoTrack(stream);
        }
      });
    });
  }

  handleVideoTrack(stream: MediaStream) {
    this.cameraStream = stream;
  }

  handleAudioTrack(stream: MediaStream) {
    this.source = audioctx().createMediaStreamSource(stream);
    this.source.connect(this.gainNode);
    attachDomAudio(this.targetId, stream);
    audioctx().resume();
  }

  setDatachannel(chan: RTCDataChannel) {
    this.datachannel = chan;
    this.datachannel.onmessage = (ev) => {
      let msg: DatachannelMessage;
      try {
        msg = JSON.parse(ev.data) as DatachannelMessage;
      } catch (_) {
        log.info(`Can't parse datachanner message`, ev.data);
        return;
      }

      if (msg.type === "speaking") {
        this.speaking = msg.speaking;
      }
    };
  }

  sendData(data: DatachannelMessage) {
    if (!this.datachannel) {
      log.warn(
        `Trying to send a message when no channel is present for ${this.targetId}`,
      );
      return;
    }
    if (this.datachannel?.readyState !== "open") {
      log.warn(
        `Trying to send a message when datachannel is not open for ${this.targetId}`,
      );
      return;
    }

    try {
      this.datachannel.send(JSON.stringify(data));
    } catch (_) {
      log.error(`Failed to send datachannel message to ${this.targetId}`, data);
    }
  }

  getState(): PeerState {
    return {
      gain: this.volume,
      mute: this.mute,
    };
  }

  /**
   * After this the object should not be reused
   */
  cleanup() {
    this.datachannel?.close();
    this.pc?.close();
    this.headphones.removeSource(this.muteNode);
    if (this.source) {
      this.source.disconnect(this.gainNode);
      this.source = null;
    }
    this.gainNode.disconnect();
    this.muteNode.disconnect();
    clearInterval(this.interval as number);

    // @ts-expect-error
    delete this.pc;
  }
}

/**
 * Attach a DOM audio element to a MediaStream
 * because chrome WOULD NOT behave without it
 * (data from the stream just doesn't get sent to the sink without it)
 */
function attachDomAudio(userId: number, stream: MediaStream) {
  const id = `peer-${userId}`;
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
