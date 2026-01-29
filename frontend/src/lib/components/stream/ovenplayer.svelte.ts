import { getAudioContext } from "$lib/audiocontext";

export class OvenSignaling {
  id?: string;
  pc?: RTCPeerConnection;
  ws?: WebSocket;
  stream: MediaStream | undefined = $state(undefined);
  state: "disconnected" | "connecting" | "connected" = $state("disconnected");
  gainnode: GainNode;

  hasVideo = false;
  hasAudio = false;

  #gain = $state(1);
  get gain() {
    return this.#gain;
  }
  set gain(value: number) {
    this.#gain = value;
    this.gainnode.gain.setTargetAtTime(
      value,
      getAudioContext().currentTime,
      0.01,
    );
  }

  handleIce(event: RTCPeerConnectionIceEvent) {
    if (event.candidate === null) {
      return;
    }
    if (this.id === undefined) {
      console.warn("[OVEN] Received ICE candidate before ID");
      return;
    }
    if (this.ws === undefined) {
      console.warn("[OVEN] Received ICE candidate with no websocket");
      return;
    }

    const message: OvenSignalingMessage = {
      id: this.id,
      command: "candidate",
      candidates: [event.candidate],
    };
    this.ws.send(JSON.stringify(message));
  }

  handleTrack(event: RTCTrackEvent) {
    for (const stream of event.streams) {
      for (const track of stream.getTracks()) {
        if (track.kind === "video" && !this.stream) {
          this.stream = stream;
          this.hasVideo = true;
        } else if (track.kind === "audio") {
          this.gainnode.disconnect();
          const ctx = getAudioContext();
          const source = ctx.createMediaStreamSource(stream);
          source.connect(this.gainnode);
          this.gainnode.connect(ctx.destination);
          this.hasAudio = true;
        }
      }
    }

    if (this.hasVideo && this.hasAudio) {
      this.state = "connected";
    } else {
      this.state = "disconnected";
      console.warn("[OVEN] No video or audio:", this.hasVideo, this.hasAudio);
    }
  }

  async handleMessage(msg: MessageEvent<any>) {
    const data = parseAnswer(msg.data);
    if (data === undefined) {
      return;
    }

    this.id = data.id;
    for (const server of data.ice_servers) {
      // @ts-ignore - for some reason Oven
      // sends username (as per spec) as user_name
      // https://docs.ovenmediaengine.com/streaming/webrtc-publishing#custom-player
      server.username = server.user_name;
    }

    // TODO: include all STUN/TURN servers
    // from the server-server too
    this.pc = new RTCPeerConnection({
      iceServers: data.ice_servers,
    });

    this.pc.onicecandidate = (event) => this.handleIce(event);
    this.pc.ontrack = (event) => this.handleTrack(event);

    this.pc.setRemoteDescription(data.sdp);
    for (const candidate of data.candidates) {
      this.pc.addIceCandidate(candidate);
    }
    const offer = await this.pc.createAnswer();
    await this.pc.setLocalDescription(offer);
    const message: OvenSignalingMessage = {
      id: this.id,
      command: "answer",
      sdp: offer,
      candidates: [],
    };

    if (this.ws === undefined) {
      console.warn("[OVEN] handleMessage called with no websocket");
      return;
    }

    this.ws?.send(JSON.stringify(message));
  }

  connect() {
    this.disconnect();
    this.state = "connecting";
    let secure = true;
    if (import.meta.env.DEV) {
      secure = false;
    }
    const protocol = secure ? "wss://" : "ws://";
    this.ws = new WebSocket(
      protocol + this.host + "/app/" + this.userId + "?transport=tcp",
    );

    this.ws.onmessage = (msg) => this.handleMessage(msg);

    this.ws.onopen = () => {
      const message: OvenSignalingMessage = { command: "request_offer" };
      this.ws!.send(JSON.stringify(message));
    };
  }

  disconnect() {
    this.state = "disconnected";
    this.ws?.close();
    this.ws = undefined;
    this.pc?.close();
    this.pc = undefined;
    this.gainnode.disconnect();
    this.hasVideo = false;
    this.hasAudio = false;
  }

  constructor(
    public host: string,
    public userId: number,
  ) {
    const ctx = getAudioContext();
    this.gainnode = ctx.createGain();
    this.gainnode.connect(ctx.destination);
  }
}

type OvenSignalingMessage =
  | {
      command: "request_offer";
    }
  | {
      id: string;
      command: "answer";
      sdp: RTCSessionDescriptionInit;
      candidates: RTCIceCandidate[];
    }
  | {
      id: string;
      command: "candidate";
      candidates: RTCIceCandidate[];
    };

type OvenSignalingAnswer = {
  id: string;
  code: 200;
  ice_servers: RTCIceServer[];
  sdp: RTCSessionDescriptionInit;
  candidates: RTCIceCandidate[];
};

function parseAnswer(data: string) {
  let answer: OvenSignalingAnswer;
  try {
    answer = JSON.parse(data) as OvenSignalingAnswer;
  } catch (e) {
    console.error(e);
    return;
  }

  if (!answer.code) {
    return;
  }

  if (answer.code !== 200) {
    console.error("Error oven anwer: ", answer);
    return;
  }

  return answer;
}
