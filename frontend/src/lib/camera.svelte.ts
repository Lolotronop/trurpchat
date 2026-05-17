import { log } from "$lib/log";
import { getPlatformStore, type IPersistantStore } from "./webstore";

export class Camera {
  store: IPersistantStore = getPlatformStore("camera");
  hasPermissions: boolean = $state(false);
  stream: MediaStream | undefined = $state(undefined);

  devices: MediaDeviceInfo[] = $state([]);

  #showMyVideo: boolean = $state(true);
  set showMyVideo(value: boolean) {
    this.#showMyVideo = value;
    this.store.set("showMyVideo", value);
  }
  get showMyVideo() {
    return this.#showMyVideo;
  }

  #deviceId: string | undefined = $state(undefined);
  set deviceId(value: string | undefined) {
    this.#deviceId = value;
    this.store.set("deviceId", value);
  }
  get deviceId() {
    return this.#deviceId;
  }

  constructor() {
    this.init();
  }

  async init() {
    this.#showMyVideo = (await this.store.get<boolean>("showMyVideo")) ?? true;
    this.#deviceId = await this.store.get("deviceId");

    this.hasPermissions = true;
    this.updateDevices();
  }

  async enable(exact = true) {
    const settings: MediaTrackConstraints = {};

    if (this.deviceId) {
      settings.deviceId = exact ? { exact: this.deviceId } : this.deviceId;
    }

    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        video: settings,
      });
      const track = this.stream.getVideoTracks()[0];
      if (!track) {
        throw new Error("The video track for the camera is not there!");
      }
      const deviceId = track.getSettings().deviceId;
      this.deviceId = deviceId;
    } catch (error) {
      if (error instanceof OverconstrainedError && exact) {
        await this.enable(false);
        return;
      }

      log.error("Error enabling camera:", error);
      return;
    }
  }

  disable() {
    this.stream?.getVideoTracks().forEach((track) => {
      track.stop();
    });
    this.stream = undefined;
  }

  async updateDevices() {
    let devices = await navigator.mediaDevices.enumerateDevices();
    devices = devices.filter((device) => device.kind === "videoinput");
    this.devices = devices;
  }
}
