import { env } from "bun";
import { isAbsolute, resolve } from "node:path";
import { err, ok, ResultAsync, type Result } from "neverthrow";
import type { IceConfig, OvenMediaEngineConfig } from "trurpchat-shared";

export type BackendConfig = {
  port: number;
  // TODO: remove in future versions. Legacy OvenMediaEngine URL kept for backwards compatibility.
  ovenServerUrl?: string;
  ovenMediaEngine: OvenMediaEngineConfig;
  iceConfig: IceConfig;
};

class ConfigError extends Error {
  constructor(problems: string[]) {
    super(["Invalid backend configuration:", ...problems.map((problem) => `- ${problem}`)].join("\n"));
    this.name = "ConfigError";
  }
}

function describeError(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function parsePort(value: string | undefined, defaultValue: number) {
  const port = Number(value);
  return Number.isFinite(port) && port > 0 ? port : defaultValue;
}

function parseBoolean(value: string | undefined, defaultValue: boolean) {
  if (value === undefined) return defaultValue;
  return ["1", "true", "yes", "on"].includes(value.toLowerCase());
}

function ovenHost(value: string | undefined) {
  if (!value) return undefined;
  const withoutProtocol = value.replace(/^\w+:\/\//, "");
  return withoutProtocol.split("/")[0]?.split(":")[0] || undefined;
}

function isIceConfig(value: unknown): value is IceConfig {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const iceServers = (value as { iceServers?: unknown }).iceServers;
  if (!Array.isArray(iceServers)) {
    return false;
  }

  return iceServers.every((server) => {
    if (typeof server !== "object" || server === null) {
      return false;
    }

    const { urls, username, credential } = server as {
      urls?: unknown;
      username?: unknown;
      credential?: unknown;
    };

    const validUrls =
      typeof urls === "string" ||
      (Array.isArray(urls) && urls.every((url) => typeof url === "string"));

    return (
      validUrls &&
      (username === undefined || typeof username === "string") &&
      (credential === undefined || typeof credential === "string")
    );
  });
}

function resolveIceConfigFile(configuredFile: string) {
  return isAbsolute(configuredFile)
    ? configuredFile
    : resolve(process.cwd(), configuredFile);
}

function loadIceConfig(): ResultAsync<IceConfig, string> {
  const configuredFile = env.ICE_CONFIG_FILE?.trim();
  const source = configuredFile
    ? resolveIceConfigFile(configuredFile)
    : new URL("../ice.json", import.meta.url);
  const sourceLabel = configuredFile ? String(source) : "backend/ice.json";
  const sourceDescription = configuredFile
    ? `${sourceLabel} (from ICE_CONFIG_FILE=${configuredFile})`
    : sourceLabel;
  const file = Bun.file(source);

  return ResultAsync.fromPromise(
    file.text(),
    (error) => `Unable to read ICE config at ${sourceDescription}: ${describeError(error)}`,
  ).andThen((content): Result<IceConfig, string> => {
    let parsed: unknown;
    try {
      parsed = JSON.parse(content);
    } catch (error) {
      return err(`Failed to parse ICE config at ${sourceDescription}: ${describeError(error)}`);
    }

    if (!isIceConfig(parsed)) {
      return err(`Invalid ICE config at ${sourceDescription}: expected { iceServers: [...] }`);
    }

    return ok(parsed);
  });
}

export async function loadConfig(): Promise<BackendConfig> {
  const iceConfigResult = await loadIceConfig();

  if (iceConfigResult.isErr()) {
    throw new ConfigError([iceConfigResult.error]);
  }

  const iceConfig = iceConfigResult.value;

  return {
    port: parsePort(env.PORT, 3000),
    ovenServerUrl: env.OVEN_SERVER_URL,
    ovenMediaEngine: {
      host: ovenHost(env.OVEN_HOST) ?? ovenHost(env.OVEN_SERVER_URL) ?? "localhost",
      watchPort: parsePort(env.OVEN_WATCH_PORT, 3333),
      streamPort: parsePort(env.OVEN_STREAM_PORT, 1935),
      appName: env.OVEN_APP_NAME ?? "app",
      secure: parseBoolean(env.OVEN_SECURE, false),
    },
    iceConfig,
  };
}
