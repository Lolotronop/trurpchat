import { isTauri } from "@tauri-apps/api/core";
import {
  register,
  type ShortcutHandler,
  unregister,
  unregisterAll,
} from "@tauri-apps/plugin-global-shortcut";
import { SvelteMap } from "svelte/reactivity";
import { getPlatformStore, type IPersistantStore } from "./webstore";

export const actions = {
  mute: "Выключить микрофон",
  deafen: "Выключить звук",
  pushToTalk: "Рация (push to talk)",
} as const;
type KeyAction = keyof typeof actions;

const keymap = {
  ControlLeft: "Ctrl",
  ControlRight: "Ctrl",
  AltLeft: "Alt",
  AltRight: "Alt",
};

export class Shortcuts extends EventTarget {
  store: IPersistantStore;
  detectingFor: KeyAction | null = $state(null);
  bindings = new SvelteMap<KeyAction, string | null>();

  constructor() {
    super();
    this.store = getPlatformStore("shortcuts");

    this.unregisterAll();

    for (const action of Object.keys(actions) as KeyAction[]) {
      this.bindings.set(action, null);
    }
    this.store.entries().then((entries) => {
      for (const [key, value] of entries) {
        this.set(key as KeyAction, value as string);
      }
    });
  }

  unregisterAll() {
    if (isTauri()) {
      unregisterAll();
    } else {
      console.warn("Shortcuts are not implemented for the web yet");
    }
  }

  async register(
    shortcuts: string | string[],
    handler: ShortcutHandler,
  ): Promise<void> {
    if (isTauri()) {
      register(shortcuts, handler);
    } else {
      console.warn("Shortcuts are not implemented for the web yet");
    }
  }

  unregister(shortcuts: string | string[]) {
    if (isTauri()) {
      unregister(shortcuts);
    } else {
      console.warn("Shortcuts are not implemented for the web yet");
    }
  }

  set(action: KeyAction, key: string) {
    if (this.bindings.has(action)) {
      const oldKey = this.bindings.get(action);
      if (oldKey) {
        this.unregister(oldKey);
      }
    }
    this.bindings.set(action, key);
    this.store.set(action, key);
    this.register(key, (e) => {
      this.dispatchEvent(Object.assign(new Event(action), e));
    });
  }

  private fromKeyboard = (e: KeyboardEvent) => {
    if (!this.detectingFor) return;
    let key = "";

    if (Object.keys(keymap).includes(e.code)) {
      this.stopDetect();
      console.log("Can't set that sorry bud");
      return;
    } else {
      if (e.ctrlKey) key = "Ctrl+";
      if (e.altKey) key += "Alt+";
      if (e.shiftKey) key += "Shift+";
      key += e.code;
    }

    try {
      this.set(this.detectingFor, key);
    } catch (error) {
      console.error("Cannot set shortcut:", error);
    }

    this.stopDetect();
  };

  detect(action: KeyAction) {
    this.detectingFor = action;
    console.log("detecting", this.detectingFor);
    window.addEventListener("keyup", this.fromKeyboard);
  }

  stopDetect() {
    window.removeEventListener("keyup", this.fromKeyboard);
    this.detectingFor = null;
  }

  unset(action: KeyAction) {
    const key = this.bindings.get(action);
    this.bindings.set(action, null);
    this.store.delete(action);
    if (key) this.unregister(key);
  }

  on(action: KeyAction, callback: (state: "Pressed" | "Released") => void) {
    this.addEventListener(action, (e) => {
      // @ts-expect-error
      callback(e.state);
    });
  }
}
