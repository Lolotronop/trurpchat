import { getAudioContext } from "./audiocontext";
import type { Mic } from "./mic.svelte";
import { ICE_CONFIG } from "./webrtc.svelte";

type DatachannelMessage = {
  type: "speaking",
  speaking: boolean;
}

export class Peer {
  mic: Mic;
  pc: RTCPeerConnection;
  datachannel: RTCDataChannel | null = null;

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

  /** in ms */
  ping: number = $state(0);

  interval: NodeJS.Timeout | number | null = null;

  constructor(public targetId: number, mic: Mic, output: GainNode) {
    this.mic = mic;
    this.pc = new RTCPeerConnection(ICE_CONFIG);
    this.gainNode = getAudioContext().createGain();
    this.muteNode = getAudioContext().createGain();

    this.gainNode.connect(this.muteNode);
    this.muteNode.connect(output);

    this.interval = setInterval(() => this.updatePing(), 1000);

    if (!this.mic.stream) {
      throw new Error("Local stream not available");
    }

    const [audioTrack] = this.mic.nodes.destination.stream.getAudioTracks();
    this.pc.addTrack(audioTrack, this.mic.stream);

    this.pc.ontrack = (event) => { this.handleOntrack(event) };
    this.pc.ondatachannel = (event) => { this.setDatachannel(event.channel) };

    // this will probably be needed for enabling cam
    // or bitrate changes?
    this.pc.onnegotiationneeded = async (event) => {
      console.log(`Negotiation needed for ${targetId}`, event);
    };
  }

  async updatePing() {
    const stats = await this.pc.getStats()
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
    const stream = event.streams[0];
    if (!stream) {
      throw new Error(`No stream for ${this.targetId} found`);
    }
    const audioTrack = stream.getAudioTracks()[0];
    if (!audioTrack) {
      throw new Error(`Audio track for ${this.targetId} not found`);
    }

    const source = getAudioContext().createMediaStreamSource(stream);
    source.connect(this.gainNode);
    attachDomAudio(this.targetId, stream);
    getAudioContext().resume();
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
    }
  }

  sendData(data: DatachannelMessage) {
    if (!this.datachannel) {
      console.warn(`Trying to send a message when no channel is present for ${this.targetId}`);
      return;
    }
    if (this.datachannel?.readyState !== "open") {
      console.warn(`Trying to send a message when datachannel is not open for ${this.targetId}`);
      return;
    }

    try {
      this.datachannel.send(JSON.stringify(data))
    } catch (e) {
      console.error(`Failed to send datachannel message to ${this.targetId}`, data)
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
