import { isTauri } from "@tauri-apps/api/core"
import { LazyStore } from "@tauri-apps/plugin-store";

export interface IStore {
  set(key: string, value: unknown): Promise<void>;
  get<T>(key: string): Promise<T | undefined>;
  has(key: string): Promise<boolean>;
  delete(key: string): Promise<boolean>;
  clear(): Promise<void>;
  reset(): Promise<void>;
  keys(): Promise<string[]>;
  values<T>(): Promise<T[]>;
  entries<T>(): Promise<Array<[key: string, value: T]>>;
  length(): Promise<number>;
  reload(): Promise<void>;
  save(): Promise<void>;
  close(): Promise<void>;
}

export const getPlatformStore = () => {
  if (isTauri()) {
    return LazyStore;
  } else {
    return WebStore;
  }
}

class WebStore implements IStore {
  private storage: Storage;
  private prefix: string;
  private isClosed: boolean = false;

  constructor(prefix: string = '') {
    this.storage = window.localStorage;
    this.prefix = prefix;
  }

  private getPrefixedKey(key: string): string {
    return this.prefix ? `${this.prefix}:${key}` : key;
  }

  private checkClosed(): void {
    if (this.isClosed) {
      throw new Error('WebStore is closed');
    }
  }

  private serialize(value: unknown): string {
    try {
      return JSON.stringify(value);
    } catch (error) {
      throw new Error(`Failed to serialize value: ${error}`);
    }
  }

  private deserialize<T>(value: string | null): T | undefined {
    if (value === null) return undefined;
    try {
      return JSON.parse(value) as T;
    } catch (error) {
      console.warn(`Failed to deserialize value: ${value}`, error);
      return undefined;
    }
  }

  async set(key: string, value: unknown): Promise<void> {
    this.checkClosed();
    const prefixedKey = this.getPrefixedKey(key);
    const serializedValue = this.serialize(value);
    this.storage.setItem(prefixedKey, serializedValue);
  }

  async get<T>(key: string): Promise<T | undefined> {
    this.checkClosed();
    const prefixedKey = this.getPrefixedKey(key);
    const value = this.storage.getItem(prefixedKey);
    console.log("get", key, value);
    return this.deserialize<T>(value);
  }

  async has(key: string): Promise<boolean> {
    this.checkClosed();
    const prefixedKey = this.getPrefixedKey(key);
    return this.storage.getItem(prefixedKey) !== null;
  }

  async delete(key: string): Promise<boolean> {
    this.checkClosed();
    const prefixedKey = this.getPrefixedKey(key);
    const existed = this.storage.getItem(prefixedKey) !== null;
    if (existed) {
      this.storage.removeItem(prefixedKey);
    }
    return existed;
  }

  async clear(): Promise<void> {
    this.checkClosed();

    if (!this.prefix) {
      this.storage.clear();
      return;
    }

    // Only clear keys with the current prefix
    const keysToRemove: string[] = [];
    for (let i = 0; i < this.storage.length; i++) {
      const key = this.storage.key(i);
      if (key && key.startsWith(`${this.prefix}:`)) {
        keysToRemove.push(key);
      }
    }

    keysToRemove.forEach(key => this.storage.removeItem(key));
  }

  async reset(): Promise<void> {
    this.checkClosed();
    await this.clear();
  }

  async keys(): Promise<string[]> {
    this.checkClosed();

    const keys: string[] = [];
    for (let i = 0; i < this.storage.length; i++) {
      const key = this.storage.key(i);
      if (key) {
        if (!this.prefix || key.startsWith(`${this.prefix}:`)) {
          const unprefixedKey = this.prefix
            ? key.substring(this.prefix.length + 1)
            : key;
          keys.push(unprefixedKey);
        }
      }
    }
    return keys;
  }

  async values<T>(): Promise<T[]> {
    this.checkClosed();

    const values: T[] = [];
    for (let i = 0; i < this.storage.length; i++) {
      const key = this.storage.key(i);
      if (key && (!this.prefix || key.startsWith(`${this.prefix}:`))) {
        const value = this.storage.getItem(key);
        if (value !== null) {
          const deserialized = this.deserialize<T>(value);
          if (deserialized !== undefined) {
            values.push(deserialized);
          }
        }
      }
    }
    return values;
  }

  async entries<T>(): Promise<Array<[key: string, value: T]>> {
    this.checkClosed();

    const entries: Array<[key: string, value: T]> = [];
    for (let i = 0; i < this.storage.length; i++) {
      const key = this.storage.key(i);
      if (key && (!this.prefix || key.startsWith(`${this.prefix}:`))) {
        const unprefixedKey = this.prefix
          ? key.substring(this.prefix.length + 1)
          : key;
        const value = this.storage.getItem(key);
        if (value !== null) {
          const deserialized = this.deserialize<T>(value);
          if (deserialized !== undefined) {
            entries.push([unprefixedKey, deserialized]);
          }
        }
      }
    }
    return entries;
  }

  async length(): Promise<number> {
    this.checkClosed();

    if (!this.prefix) {
      return this.storage.length;
    }

    let count = 0;
    for (let i = 0; i < this.storage.length; i++) {
      const key = this.storage.key(i);
      if (key && key.startsWith(`${this.prefix}:`)) {
        count++;
      }
    }
    return count;
  }

  async reload(): Promise<void> {
    this.checkClosed();
    // localStorage is synchronous and automatically persisted,
    // so reload doesn't need to do anything
    // This method is kept for API compatibility
  }

  async save(): Promise<void> {
    this.checkClosed();
    // localStorage is automatically saved,
    // so save doesn't need to do anything
    // This method is kept for API compatibility
  }

  async close(): Promise<void> {
    this.isClosed = true;
  }

  open(): void {
    this.isClosed = false;
  }

  static isAvailable(): boolean {
    try {
      const testKey = '__test__';
      window.localStorage.setItem(testKey, testKey);
      window.localStorage.removeItem(testKey);
      return true;
    } catch (e) {
      return false;
    }
  }

  static getUsage(): number {
    let total = 0;
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key) {
        const value = localStorage.getItem(key);
        total += key.length + (value ? value.length : 0);
      }
    }
    return total;
  }
}

