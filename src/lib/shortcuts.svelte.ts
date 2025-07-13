import { LazyStore } from "@tauri-apps/plugin-store";
import {
  register,
  unregister,
  unregisterAll,
} from "@tauri-apps/plugin-global-shortcut";
import { SvelteMap } from "svelte/reactivity";

const actions = ["mute"] as const;
type KeyAction = (typeof actions)[number];

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
    this.store = new LazyStore("kektor.json");
    for (const action of actions) {
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
      // @ts-expect-error
      key = keymap[e.code];
    } else {
      if (e.ctrlKey) key = "Ctrl+";
      if (e.altKey) key += "Alt+";
      if (e.shiftKey) key += "Shift+";
      key += e.code;
    }

    this.set(this.detectingFor, key);

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
