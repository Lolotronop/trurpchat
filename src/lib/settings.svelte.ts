import { LazyStore } from "@tauri-apps/plugin-store";
import debounced from "./utils.svelte";
import type { Themes } from "./theme.svelte";

interface SettingsKeys {
  version: string;
  gatewayServer: string;
  ovenServer: string;
  username: string | "default";
  bgColor: string;
  muted: boolean;
  deviceId: string | null;
  gain: number;
  gateThreshold: number;
  noiseSuppression: boolean;
  echoCancellation: boolean;
  theme: Themes;
  customCss: string;
}

const defaultSettings: SettingsKeys = {
  version: "1",
  gatewayServer: "lolotronop.ru:3000",
  // gatewayServer: "lolo-desktop:3000",
  ovenServer: "90.188.89.207",
  username: "default",
  bgColor: "#070709",
  muted: false,
  deviceId: null,
  gain: 1,
  gateThreshold: -30,
  noiseSuppression: true,
  echoCancellation: false,
  theme: "default",
  customCss: "",
};

export class Settings {
  private store: LazyStore;

  ready: boolean = $state(false);
  settings: SettingsKeys = $state({ ...defaultSettings });
  tauri: boolean;

  constructor(tauri: boolean) {
    this.store = new LazyStore("settings.json");
    this.tauri = tauri;

    const save = debounced(() => this.save(), 500);

    this.init().then(() => {
      this.ready = true;
      $effect.root(() => {
        $effect(() => {
          this.settings;
          save();
        });
      });
    });
  }

  save() {
    console.log("Saving settings...");
    if (this.tauri) {
      Object.keys(this.settings).forEach(async (k) => {
        const key = k as keyof SettingsKeys;
        this.store.set(key, this.settings[key]);
      });
    }
  }

  private async init() {
    if (!this.tauri) {
      return;
    }
    const hasData = await this.store.has("version");
    if (!hasData) {
      this.save();
    } else {
      await this.store.reload();
      const entries = await this.store.entries();
      const keys = Object.keys(this.settings);
      entries.forEach(([key, value]) => {
        if (keys.includes(key)) {
          // @ts-ignore
          this.settings[key] = value;
        } else {
          console.warn(`Unknown setting key: ${key}: ${value}`);
        }
      });
    }
  }
}
