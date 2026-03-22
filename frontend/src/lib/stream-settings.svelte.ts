import { getPlatformStore } from "./webstore";

export class StreamSettings {
  store = getPlatformStore("stream-settings.json");

  #width: number = $state(1920);
  #height: number = $state(1080);
  #audioBitrate: number = $state(192_000);
  #videoBitrate: number = $state(4_000_000);
  #fps: number = $state(30);
  #presetNum: number = $state(1);
  #useHwAccel: boolean = $state(true);

  constructor() {
    this.init();
  }

  set width(value: number) {
    this.#width = value;
    this.store.set("width", value);
  }
  get width() {
    return this.#width;
  }

  set height(value: number) {
    this.#height = value;
    this.#width = (value / 9) * 16;
    this.store.set("height", value);
    this.store.set("width", this.#width);
  }
  get height() {
    return this.#height;
  }

  set audioBitrate(value: number) {
    this.#audioBitrate = value;
    this.store.set("audioBitrate", value);
  }
  get audioBitrate() {
    return this.#audioBitrate;
  }

  set videoBitrate(value: number) {
    this.#videoBitrate = value;
    this.store.set("videoBitrate", value);
  }
  get videoBitrate() {
    return this.#videoBitrate;
  }

  set fps(value: number) {
    this.#fps = value;
    this.store.set("fps", value);
  }
  get fps() {
    return this.#fps;
  }

  set presetNum(value: number) {
    this.#presetNum = value;
    this.store.set("presetNum", value);
  }
  get presetNum() {
    return this.#presetNum;
  }

  set useHwAccel(value: boolean) {
    this.#useHwAccel = value;
    this.store.set("useHwAccel", value);
  }
  get useHwAccel() {
    return this.#useHwAccel;
  }

  async init() {
    const storedHeight = await this.store.get<number>("height");
    if (storedHeight !== undefined) {
      this.#height = storedHeight;
      const storedWidth = await this.store.get<number>("width");
      this.#width =
        storedWidth !== undefined ? storedWidth : (storedHeight / 9) * 16;
    }

    const storedAudioBitrate = await this.store.get<number>("audioBitrate");
    if (storedAudioBitrate !== undefined) {
      this.#audioBitrate = storedAudioBitrate;
    }

    const storedVideoBitrate = await this.store.get<number>("videoBitrate");
    if (storedVideoBitrate !== undefined) {
      this.#videoBitrate = storedVideoBitrate;
    }

    const storedFps = await this.store.get<number>("fps");
    if (storedFps !== undefined) {
      this.#fps = storedFps;
    }

    const storedPresetNum = await this.store.get<number>("presetNum");
    if (storedPresetNum !== undefined) {
      this.#presetNum = storedPresetNum;
    }

    const storedUseHwAccel = await this.store.get<boolean>("useHwAccel");
    if (storedUseHwAccel !== undefined) {
      this.#useHwAccel = storedUseHwAccel;
    }
  }
}
