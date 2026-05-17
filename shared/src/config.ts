import type { ConnectedUser } from "./user";

export type ServerMeta = {
  id: string | null;
};

export type IceServerConfig = {
  urls: string | string[];
  username?: string;
  credential?: string;
};

export type IceConfig = {
  iceServers: IceServerConfig[];
};

export type OvenMediaEngineConfig = {
  host: string;
  watchPort: number;
  streamPort: number;
  appName: string;
  secure: boolean;
};

export type OtherEvent =
  | {
      type: "event.startup.config";
      serverId: string;
      // TODO: remove in future versions
      ovenServerUrl?: string;
      ovenMediaEngine?: OvenMediaEngineConfig;
      iceConfig: IceConfig;
    }
  | {
      type: "event.connected";
      user: ConnectedUser;
    };
