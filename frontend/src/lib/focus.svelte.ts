import { isTauri } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";

let created = false;

let hasFocus = $state(true);
let changedFocusAt = $state(Date.now());

export function focused() {
  return hasFocus;
}

export function changedFocus() {
  return Date.now() - changedFocusAt < 100;
}

if (!created) {
  if (isTauri()) {
    getCurrentWindow().onFocusChanged(({ payload }) => {
      hasFocus = payload;
      changedFocusAt = Date.now();
    });
  } else {
    let prev = document.hasFocus();

    function focusChanged() {
      const cur = document.hasFocus();
      if (cur !== prev) {
        prev = cur;
      }
      hasFocus = cur;
      changedFocusAt = Date.now();
    }

    window.addEventListener("focus", focusChanged, true);
    window.addEventListener("blur", focusChanged, true);
    document.addEventListener("visibilitychange", focusChanged);
    document.addEventListener("focus", focusChanged, true);
    document.addEventListener("blur", focusChanged, true);
  }
  created = true;
}
