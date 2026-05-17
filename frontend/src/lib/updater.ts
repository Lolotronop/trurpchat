import { isTauri } from "@tauri-apps/api/core";
import { relaunch } from "@tauri-apps/plugin-process";
import { check } from "@tauri-apps/plugin-updater";

export async function runStartupUpdater() {
  if (!isTauri()) return;

  try {
    const update = await check();
    if (!update) return;

    await update.downloadAndInstall();
    await relaunch();
  } catch (error) {
    console.error("Automatic update failed", error);
  }
}
