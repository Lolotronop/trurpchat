import { debounced } from "./utils.svelte";
import type { ThemeNames } from "./theme.svelte";
import { getPlatformStore, type IStore } from "./store";

export type Server = {
  name: string;
  url: string;
  username: string;
};

interface SettingsKeys {
  version: string;
  ovenServer: string;
  servers: Server[];
  avtiveServerUrl: string | null;
  bgColor: string;
  muted: boolean;
  deviceId: string | null;
  gain: number;
  gateThreshold: number;
  noiseSuppression: boolean;
  echoCancellation: boolean;
  theme: ThemeNames;
  customCss: string;
}

const defaultSettings: SettingsKeys = {
  version: "2",
  // gatewayServer: "lolotronop.ru:3000",
  // gatewayServer: "lolo-desktop:3000",
  ovenServer: "90.188.89.207",
  servers: [],
  avtiveServerUrl: null,
  bgColor: "#070709",
  muted: false,
  deviceId: null,
  gain: 1,
  gateThreshold: -30,
  noiseSuppression: true,
  echoCancellation: false,
  theme: "gruvbox",
  customCss: "",
};

export class Settings {
  private store: IStore;

  ready: boolean = $state(false);
  settings: SettingsKeys = $state({ ...defaultSettings });

  constructor() {
    const Store = getPlatformStore();
    this.store = new Store("settings.json");

    const save = debounced(() => this.save(), 500);

    this.init().then(() => {
      this.ready = true;
      $effect.root(() => {
        $effect(() => {
          for (const k of Object.keys(this.settings)) {
            // force-subscribe to all settings updates
            // this will not cover nested structures
            // TODO: find a better way to do this
            this.settings[k as keyof SettingsKeys];
          }
          save();
        });
      });
    });
  }

  save() {
    Object.keys(this.settings).forEach(async (k) => {
      const key = k as keyof SettingsKeys;
      this.store.set(key, this.settings[key]);
    });
  }

  private async init() {
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
