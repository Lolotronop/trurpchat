import { isTauri } from "@tauri-apps/api/core";
import { BaseDirectory, readFile } from "@tauri-apps/plugin-fs";
import { resolveResource } from "@tauri-apps/api/path";
import { getAudioContext } from "./audiocontext";

const sounds = [
  "mute",
  "unmute",
  "deafen",
  "undeafen",
  "user join",
  "user leave",
  "voice disconnected",
] as const;
export type sound = (typeof sounds)[number];

export class Sound {
  ready = $state(false);

  c: AudioContext;
  volume = $state(0.3);
  gainNode: GainNode;

  // @ts-expect-error: it is initialized in the .init()
  private sounds: Record<sound, AudioBuffer> = {};

  constructor() {
    this.c = getAudioContext();
    this.gainNode = this.c.createGain();
    this.gainNode.connect(this.c.destination);
    this.gainNode.gain.setTargetAtTime(this.volume, this.c.currentTime, 0.01);
    this.init();
  }

  async init() {
    if (!isTauri()) {
      this.ready = true;
      console.warn("Sound.init() called on non-Tauri platform");
      return;
    }

    for (const sound of sounds) {
      let file: Uint8Array;
      try {
        const path = await resolveResource(`resources/sound/${sound}.mp3`);
        file = await readFile(path);
      } catch (error) {
        console.error(`Failed to load sound from resource ${sound}:`, error);
        continue;
      }

      try {
        file = await readFile(`sound/${sound}.mp3`, {
          baseDir: BaseDirectory.AppConfig,
        });
      } catch (error) {
        console.warn(`Failed to load sound from config ${sound}:`, error);
      }
      const buffer = new ArrayBuffer(file.length);
      const view = new Uint8Array(buffer);
      view.set(new Uint8Array(file.buffer));
      const data = await this.c.decodeAudioData(buffer);
      this.sounds[sound] = data;
    }
    this.ready = true;
  }

  play(sound: sound) {
    if (!this.ready) return;
    const data = this.sounds[sound];
    if (!data) {
      // console.warn(`Sound.play() called with unknown sound: ${sound}`);
      return;
    }
    const source = this.c.createBufferSource();
    source.buffer = data;
    source.connect(this.gainNode);
    source.start(0);
  }
}
