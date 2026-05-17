import { isTauri } from "@tauri-apps/api/core";
import { resolveResource } from "@tauri-apps/api/path";
import { BaseDirectory, readFile } from "@tauri-apps/plugin-fs";
import { log } from "$lib/log";
import { audioctx } from "./audio/context";

const sounds = [
  "mute",
  "unmute",
  "deafen",
  "undeafen",
  "user join",
  "user leave",
  "stream started",
  "stream stopped",
  "viewer join",
  "viewer leave",
  "voice disconnected",
  "ptt activate",
  "ptt deactivate",
  "message",
] as const;
export type SoundName = (typeof sounds)[number];

export class Sound {
  ready = $state(false);

  c: AudioContext;
  volume = $state(0.3);
  cooldownMs = $state(500);
  gainNode: GainNode;

  // @ts-expect-error: it is initialized in the .init()
  private sounds: Record<SoundName, AudioBuffer> = {};
  private lastPlayedAt: Partial<Record<SoundName, number>> = {};
  private readonly cooldownExemptSounds = new Set<SoundName>([
    "mute",
    "unmute",
    "deafen",
    "undeafen",
  ]);

  constructor() {
    this.c = audioctx();
    this.gainNode = this.c.createGain();
    this.gainNode.connect(this.c.destination);
    this.gainNode.gain.setTargetAtTime(this.volume, this.c.currentTime, 0.01);
    this.init();
  }

  async init() {
    if (!isTauri()) {
      this.ready = true;
      log.warn("Sound.init() called on non-Tauri platform");
      return;
    }

    for (const sound of sounds) {
      let file: Uint8Array;
      try {
        const path = await resolveResource(`resources/sound/${sound}.mp3`);
        file = await readFile(path);
      } catch (error) {
        // console.error(`Failed to load sound from resource ${sound}:`, error);
        try {
          file = await readFile(`sound/${sound}.mp3`, {
            baseDir: BaseDirectory.AppConfig,
          });
        } catch (error) {
          // console.warn(`Failed to load sound ${sound}:`, error);
          continue;
        }
      }

      const buffer = new ArrayBuffer(file.length);
      const view = new Uint8Array(buffer);
      view.set(new Uint8Array(file.buffer));
      const data = await this.c.decodeAudioData(buffer);
      this.sounds[sound] = data;
    }
    this.ready = true;
  }

  play(sound: SoundName) {
    if (!this.ready) return;
    const data = this.sounds[sound];
    if (!data) {
      // console.warn(`Sound.play() called with unknown sound: ${sound}`);
      return;
    }

    const now = performance.now();
    if (!this.cooldownExemptSounds.has(sound)) {
      const lastPlayedAt = this.lastPlayedAt[sound];
      if (lastPlayedAt !== undefined && now - lastPlayedAt < this.cooldownMs) {
        return;
      }
      this.lastPlayedAt[sound] = now;
    }

    const source = this.c.createBufferSource();
    source.buffer = data;
    source.connect(this.gainNode);
    source.start(0);
  }
}

export const sound = new Sound();
