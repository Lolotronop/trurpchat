import { getPlatformStore, type IPersistantStore } from "./webstore";

interface UserSettings {
  _version: string;
  muted: boolean;
  allowPause: boolean;
  activeServerUrl: string;
}

const defaultSettings: UserSettings = {
  _version: "3",
  muted: false,
  allowPause: false,
  activeServerUrl: "",
};

export class Settings {
  private store: IPersistantStore;

  ready: boolean = $state(false);
  values = $state({ ...defaultSettings });

  constructor() {
    this.store = getPlatformStore("settings");

    this.init().then(() => {
      this.ready = true;
    });
  }

  set<T extends keyof UserSettings>(key: T, value: UserSettings[T]) {
    this.store.set(key, value);
    this.values[key] = value;
  }

  save() {
    Object.keys(this.values).forEach(async (k) => {
      const key = k as keyof UserSettings;
      this.store.set(key, this.values[key]);
    });
  }

  private async init() {
    const hasVersion = await this.store.has("_version");
    if (!hasVersion) {
      this.save();
      return;
    }

    const version = await this.store.get("_version");
    if (version !== defaultSettings._version) {
      this.store.clear();
      this.save();
      return;
    }

    await this.store.reload();
    const entries = await this.store.entries();
    const keys = Object.keys(this.values);
    entries.forEach(([key, value]) => {
      if (keys.includes(key)) {
        // @ts-ignore
        this.values[key] = value;
      }
    });
  }
}
