import { audioctx } from "./audio/context";
import { ICE_CONFIG } from "./webrtc.svelte";

type DatachannelMessage = {
  type: "speaking";
  speaking: boolean;
};

export class Peer {
  pc: RTCPeerConnection;
  datachannel: RTCDataChannel | null = null;
  cameraStream: MediaStream | undefined = $state(undefined);

  gainNode: GainNode;
  muteNode: GainNode;
  #volume: number = $state(1);
  get volume(): number {
    return this.#volume;
  }
  set volume(value: number) {
    this.#volume = value;
    this.gainNode.gain.setTargetAtTime(value, audioctx().currentTime, 0.01);
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
  }

  speaking = $state(false);

  /** in ms */
  ping: number = $state(0);

  interval: NodeJS.Timeout | number | null = null;

  constructor(
    public targetId: number,
    audioStream: MediaStream,
    output: GainNode,
  ) {
    this.pc = new RTCPeerConnection(ICE_CONFIG);
    this.gainNode = audioctx().createGain();
    this.muteNode = audioctx().createGain();

    this.gainNode.connect(this.muteNode);
    this.muteNode.connect(output);

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
    const source = audioctx().createMediaStreamSource(stream);
    source.connect(this.gainNode);
    attachDomAudio(this.targetId, stream);
    audioctx().resume();
  }

  setDatachannel(chan: RTCDataChannel) {
    this.datachannel = chan;
    this.datachannel.onmessage = (ev) => {
      let msg: DatachannelMessage;
      try {
        msg = JSON.parse(ev.data) as DatachannelMessage;
      } catch (e) {
        console.log(`Can't parse datachanner message`, ev.data);
        return;
      }

      if (msg.type === "speaking") {
        this.speaking = msg.speaking;
      }
    };
  }

  sendData(data: DatachannelMessage) {
    if (!this.datachannel) {
      console.warn(
        `Trying to send a message when no channel is present for ${this.targetId}`,
      );
      return;
    }
    if (this.datachannel?.readyState !== "open") {
      console.warn(
        `Trying to send a message when datachannel is not open for ${this.targetId}`,
      );
      return;
    }

    try {
      this.datachannel.send(JSON.stringify(data));
    } catch (e) {
      console.error(
        `Failed to send datachannel message to ${this.targetId}`,
        data,
      );
    }
  }

  /**
   * After this the object should not be reused
   */
  cleanup() {
    this.datachannel?.close();
    this.pc.close();
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
