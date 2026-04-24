import { isTauri } from "@tauri-apps/api/core";
import {
  attachConsole,
  debug as tauriDebug,
  error as tauriError,
  info as tauriInfo,
  trace as tauriTrace,
  warn as tauriWarn,
} from "@tauri-apps/plugin-log";

type LogFunction = (...args: unknown[]) => void;
type Log = {
  trace: LogFunction;
  debug: LogFunction;
  info: LogFunction;
  warn: LogFunction;
  error: LogFunction;
};
export let log: Log = {
  trace: console.log,
  debug: console.debug,
  info: console.log,
  warn: console.warn,
  error: console.error,
};

let loggingInitPromise: Promise<void> | null = null;

function stringify(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }

  if (value instanceof Error) {
    return value.stack ?? `${value.name}: ${value.message}`;
  }

  if (typeof value === "undefined") {
    return "undefined";
  }

  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function formatMessage(args: unknown[]): string {
  return args.map((value) => stringify(value)).join(" ");
}

export function initLogging(): Promise<void> {
  if (!isTauri()) {
    return Promise.resolve();
  }

  loggingInitPromise ??= attachConsole()
    .then(() => undefined)
    .catch(() => {
      // ignore logger attach failures to avoid breaking app startup
    });

  log = {
    trace(...args: unknown[]): void {
      tauriTrace(formatMessage(args));
    },
    debug(...args: unknown[]): void {
      tauriDebug(formatMessage(args));
    },
    info(...args: unknown[]): void {
      tauriInfo(formatMessage(args));
    },
    warn(...args: unknown[]): void {
      tauriWarn(formatMessage(args));
    },
    error(...args: unknown[]): void {
      tauriError(formatMessage(args));
    },
  };

  return loggingInitPromise;
}
