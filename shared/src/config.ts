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

export type OtherEvent =
  | {
      type: "event.startup.config";
      serverId: string;
      ovenServerUrl?: string;
      iceConfig: IceConfig;
    }
  | {
      type: "event.connected";
      user: ConnectedUser;
    };
