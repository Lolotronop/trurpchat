import { LazyStore } from "@tauri-apps/plugin-store";
import {
  register,
  unregister,
  unregisterAll,
} from "@tauri-apps/plugin-global-shortcut";
import { SvelteMap } from "svelte/reactivity";

export const actions = {
  mute: "Выключить микрофон",
  deafen: "Выключить звук",
} as const;
type KeyAction = keyof typeof actions;

const keymap = {
  ControlLeft: "Ctrl",
  ControlRight: "Ctrl",
  AltLeft: "Alt",
  AltRight: "Alt",
};

export class Shortcuts extends EventTarget {
  store: LazyStore;
  detectingFor: KeyAction | null = $state(null);
  bindings = new SvelteMap<KeyAction, string | null>();

  constructor() {
    super();
    unregisterAll();
    this.store = new LazyStore("shortcuts.json");
    for (const action of Object.keys(actions) as KeyAction[]) {
      this.bindings.set(action, null);
    }
    this.store.entries().then(async (entries) => {
      for (const [key, value] of entries) {
        this.set(key as KeyAction, value as string);
      }
    });
  }

  set(action: KeyAction, key: string) {
    console.log("setting", action, key);
    if (this.bindings.has(action)) {
      const oldKey = this.bindings.get(action);
      if (oldKey) {
        unregister(oldKey);
      }
    }
    this.bindings.set(action, key);
    this.store.set(action, key);
    register(key, (e) => {
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
    if (key) unregister(key);
  }

  on(action: KeyAction, callback: (state: "Pressed" | "Released") => void) {
    this.addEventListener(action, (e) => {
      // @ts-expect-error
      callback(e.state);
    });
  }
}
