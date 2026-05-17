export class WakeLockContainer {
  wakeLock: WakeLockSentinel | null = null;

  async lock() {
    if (!this.wakeLock) {
      this.wakeLock = await navigator.wakeLock.request("screen");
    }
  }

  async release() {
    if (this.wakeLock) {
      await this.wakeLock.release();
      this.wakeLock = null;
    }
  }
}
