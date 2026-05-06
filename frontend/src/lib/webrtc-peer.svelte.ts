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
type LogContext = Record<string, unknown>;

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
  private lastPingHealthLogKey: string | null = null;

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

    this.logInfo("constructed", {
      initialState: initialState ?? null,
      audioTrackIds: audioStream.getAudioTracks().map((track) => track.id),
      iceServerCount: Array.isArray((iceConfig as RTCConfiguration).iceServers)
        ? (iceConfig as RTCConfiguration).iceServers!.length
        : 0,
    });

    this.interval = setInterval(() => this.updatePing(), 1000);
    this.logTrace("ping-interval-started", { intervalMs: 1000 });

    const [audioTrack] = audioStream.getAudioTracks();
    if (!audioTrack) {
      log.warn(
        "[Peer:constructor-no-audio-track] No outgoing audio track was available when creating the peer",
        this.createLogContext({
          audioTrackCount: audioStream.getAudioTracks().length,
        }),
      );
    } else {
      this.pc.addTrack(audioTrack, audioStream);
      this.logInfo("outgoing-audio-track-added", {
        trackId: audioTrack.id,
        trackState: audioTrack.readyState,
        streamId: audioStream.id,
      });
    }

    this.pc.ontrack = (event) => {
      this.logInfo("peer-track-event-received", {
        trackKind: event.track.kind,
        trackId: event.track.id,
        streamIds: event.streams.map((stream) => stream.id),
      });
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
        this.logInfo("hmr-before-update-cleanup", {});
        this.cleanup();
      });
    }
  }

  private createLogContext(context: LogContext = {}) {
    return {
      targetId: this.targetId,
      hasDatachannel: Boolean(this.datachannel),
      datachannelState: this.datachannel?.readyState ?? null,
      volume: this.#volume,
      mute: this.#mute,
      speaking: this.speaking,
      pingMs: this.ping,
      connectionState: this.pc?.connectionState ?? null,
      iceConnectionState: this.pc?.iceConnectionState ?? null,
      signalingState: this.pc?.signalingState ?? null,
      ...context,
    };
  }

  private logTrace(event: string, context: LogContext = {}) {
    log.trace(`[Peer:${event}]`, this.createLogContext(context));
  }

  private logInfo(event: string, context: LogContext = {}) {
    log.info(`[Peer:${event}]`, this.createLogContext(context));
  }

  private logWarn(event: string, context: LogContext = {}) {
    log.warn(`[Peer:${event}]`, this.createLogContext(context));
  }

  private getPingHealthIssues() {
    const issues: string[] = [];

    if (this.pc.connectionState !== "connected") {
      issues.push(`connectionState:${this.pc.connectionState}`);
    }

    if (
      this.pc.iceConnectionState !== "connected" &&
      this.pc.iceConnectionState !== "completed"
    ) {
      issues.push(`iceConnectionState:${this.pc.iceConnectionState}`);
    }

    if (this.pc.signalingState !== "stable") {
      issues.push(`signalingState:${this.pc.signalingState}`);
    }

    if (this.datachannel && this.datachannel.readyState !== "open") {
      issues.push(`datachannelState:${this.datachannel.readyState}`);
    }

    return issues;
  }

  private describeDatachannelMessage(message: DatachannelMessage) {
    return {
      type: message.type,
      speaking: message.speaking,
    };
  }

  async updatePing() {
    const stats = await this.pc.getStats();
    let foundCandidatePair = false;

    stats.forEach((report) => {
      if (
        report.type === "candidate-pair" &&
        report.state === "succeeded" &&
        report.nominated === true
      ) {
        foundCandidatePair = true;
        const nextPing = report.currentRoundTripTime * 1000;
        this.ping = nextPing;
      }
    });

    if (foundCandidatePair) {
      this.lastPingHealthLogKey = null;
      return;
    }

    const issues = this.getPingHealthIssues();
    if (issues.length === 0) {
      return;
    }

    const logKey = issues.join("|");
    if (this.lastPingHealthLogKey === logKey) {
      return;
    }

    this.lastPingHealthLogKey = logKey;
    this.logWarn("ping-update-skipped-connection-unhealthy", {
      reasons: issues,
    });
  }

  handleOntrack(event: RTCTrackEvent) {
    this.logInfo("track-dispatch-started", {
      trackKind: event.track.kind,
      trackId: event.track.id,
      streamIds: event.streams.map((stream) => stream.id),
    });

    event.streams.forEach((stream) => {
      this.logTrace("track-dispatch-stream-processing", {
        streamId: stream.id,
        trackKinds: stream.getTracks().map((track) => track.kind),
        trackIds: stream.getTracks().map((track) => track.id),
      });
      stream.getTracks().forEach((track) => {
        if (track.kind === "audio") {
          this.logInfo("track-dispatch-audio-track", {
            streamId: stream.id,
            trackId: track.id,
          });
          this.handleAudioTrack(stream);
        }
        if (track.kind === "video") {
          this.logInfo("track-dispatch-video-track", {
            streamId: stream.id,
            trackId: track.id,
          });
          this.handleVideoTrack(stream);
        }
      });
    });
  }

  handleVideoTrack(stream: MediaStream) {
    this.cameraStream = stream;
    this.logInfo("video-track-attached", {
      streamId: stream.id,
      videoTrackIds: stream.getVideoTracks().map((track) => track.id),
    });
  }

  handleAudioTrack(stream: MediaStream) {
    if (this.source) {
      this.logInfo("audio-track-replacing-existing-source", {
        streamId: stream.id,
      });
      this.source.disconnect();
      this.source = null;
    }

    this.source = audioctx().createMediaStreamSource(stream);
    this.source.connect(this.gainNode);
    this.logInfo("audio-track-connected-to-gain", {
      streamId: stream.id,
      audioTrackIds: stream.getAudioTracks().map((track) => track.id),
    });
    attachDomAudio(this.targetId, stream);
    this.logTrace("audio-dom-element-attached", {
      streamId: stream.id,
    });
    audioctx().resume();
    this.logTrace("audio-context-resume-requested", {});
  }

  setDatachannel(chan: RTCDataChannel) {
    this.datachannel = chan;
    this.logInfo("datachannel-attached", {
      label: chan.label,
      readyState: chan.readyState,
      protocol: chan.protocol,
      ordered: chan.ordered,
    });

    this.datachannel.onopen = () => {
      this.logInfo("datachannel-opened", {
        label: chan.label,
        readyState: chan.readyState,
      });
    };

    this.datachannel.onclose = () => {
      this.logInfo("datachannel-closed", {
        label: chan.label,
        readyState: chan.readyState,
      });
    };

    this.datachannel.onerror = (event) => {
      log.warn(
        "[Peer:datachannel-error] Datachannel emitted an error event",
        this.createLogContext({
          label: chan.label,
          readyState: chan.readyState,
          eventType: event.type,
        }),
      );
    };

    this.datachannel.onmessage = (ev) => {
      let msg: DatachannelMessage;
      try {
        msg = JSON.parse(ev.data) as DatachannelMessage;
      } catch (error) {
        log.info(
          "[Peer:datachannel-message-parse-failed] Failed to parse datachannel payload as JSON",
          this.createLogContext({
            label: chan.label,
            payload: ev.data,
            error,
          }),
        );
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
        "[Peer:datachannel-send-missing-channel] Tried to send datachannel message without an attached channel",
        this.createLogContext({
          message: this.describeDatachannelMessage(data),
        }),
      );
      return;
    }
    if (this.datachannel.readyState !== "open") {
      log.warn(
        "[Peer:datachannel-send-channel-not-open] Tried to send datachannel message while the channel was not open",
        this.createLogContext({
          message: this.describeDatachannelMessage(data),
          label: this.datachannel.label,
          readyState: this.datachannel.readyState,
        }),
      );
      return;
    }

    try {
      this.datachannel.send(JSON.stringify(data));
    } catch (error) {
      log.error(
        "[Peer:datachannel-send-failed] Failed to send datachannel payload",
        this.createLogContext({
          message: this.describeDatachannelMessage(data),
          label: this.datachannel.label,
          error,
        }),
      );
    }
  }

  getState(): PeerState {
    const state = {
      gain: this.volume,
      mute: this.mute,
    };
    this.logTrace("state-snapshot-generated", { state });
    return state;
  }

  /**
   * After this the object should not be reused
   */
  cleanup() {
    this.logInfo("cleanup-started", {
      hasSource: Boolean(this.source),
      hasCameraStream: Boolean(this.cameraStream),
      hasInterval: Boolean(this.interval),
    });
    this.datachannel?.close();
    this.pc?.close();
    this.headphones.removeSource(this.muteNode);
    if (this.source) {
      this.source.disconnect(this.gainNode);
      this.source = null;
      this.logTrace("cleanup-source-disconnected", {});
    }
    this.gainNode.disconnect();
    this.muteNode.disconnect();
    clearInterval(this.interval as number);
    this.interval = null;
    this.logTrace("cleanup-audio-nodes-disconnected", {});

    // @ts-expect-error
    delete this.pc;
    this.logInfo("cleanup-finished", {});
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
    log.info(
      "[Peer:dom-audio-create] Creating hidden DOM audio element for remote stream",
      {
        userId,
        streamId: stream.id,
        elementId: id,
      },
    );
    audio = document.createElement("audio");
    audio.id = id;
    audio.autoplay = true;
    audio.muted = true;
    audio.style.display = "none";
    document.body.appendChild(audio);
  } else {
    log.trace(
      "[Peer:dom-audio-reuse] Reusing hidden DOM audio element for remote stream",
      {
        userId,
        streamId: stream.id,
        elementId: id,
      },
    );
  }

  audio.srcObject = stream;
  log.trace(
    "[Peer:dom-audio-src-object-set] Attached remote stream to hidden DOM audio element",
    {
      userId,
      streamId: stream.id,
      elementId: id,
    },
  );
  return audio;
}
