import { isTauri } from "@tauri-apps/api/core";
import { log } from "$lib/log";
import { EffectChain } from "./audio/chain.svelte";
import { CompressorEffect } from "./audio/compressor.svelte";
import { audioctx } from "./audio/context";
import { GainEffect } from "./audio/gain.svelte";
import { debounce } from "./utils.svelte";
import { getPlatformStore, type IPersistantStore } from "./webstore";

export class Headphones {
  ctx: AudioContext = audioctx();
  store: IPersistantStore = getPlatformStore("headphones");
  persistGain = debounce((value: number) => this.store.set("gain", value));
  deviceId: string | undefined = $state(undefined);
  devices: MediaDeviceInfo[] = $state([]);
  effects = new EffectChain({
    gain: new GainEffect(),
    mute: new GainEffect(),
    limiter: new CompressorEffect({
      threshold: -1,
      knee: 0,
      ratio: 20,
      attack: 0.001,
      release: 0.05,
    }),
  });

  #muted: boolean = $state(false);
  set muted(value: boolean) {
    this.#muted = value;
    this.store.set("muted", value);
    this.effects.nodes.mute.muted = value;
  }
  get muted() {
    return this.#muted;
  }

  get gain() {
    return this.effects.nodes.gain.gain;
  }
  set gain(value: number) {
    this.effects.nodes.gain.gain = value;
    this.persistGain(value);
  }

  get supportsDeviceSelection() {
    return isTauri() && "setSinkId" in AudioContext.prototype;
  }

  set outputDeviceId(value: string | undefined) {
    this.deviceId = value;
    this.store.set("deviceId", value);
    void this.applyDevice(value);
  }

  get outputDeviceId() {
    return this.deviceId;
  }

  constructor() {
    this.effects.addSink(this.ctx.destination);
    this.init();
  }

  addSource(source: AudioNode) {
    this.effects.addSource(source);
  }

  removeSource(source: AudioNode) {
    this.effects.removeSource(source);
  }

  async init() {
    this.deviceId = await this.store.get<string>("deviceId");
    this.muted = (await this.store.get<boolean>("muted")) ?? false;
    this.gain = (await this.store.get<number>("gain")) ?? 1;
    await this.updateDevices();
    await this.applyDevice(this.deviceId);
  }

  async updateDevices() {
    let devices = await navigator.mediaDevices.enumerateDevices();
    devices = devices.filter((device) => device.kind === "audiooutput");
    this.devices = devices;
  }

  async applyDevice(deviceId: string | undefined) {
    if (!this.supportsDeviceSelection) {
      return;
    }

    try {
      await this.ctx.setSinkId(deviceId || "");
    } catch (error) {
      log.warn("Failed to switch audio output device", error);
      this.deviceId = undefined;
      this.store.set("deviceId", undefined);

      try {
        await this.ctx.setSinkId("");
      } catch (fallbackError) {
        log.warn("Failed to restore default audio output", fallbackError);
      }
    }
  }
}
