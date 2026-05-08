export type UserData = {
  id: number;
  name: string;
  displayName: string | null;
  permissions: number;
  deletedAt: Date | null;
};

export type DbUser = UserData;

export type ConnectedUserState = {
  muted: boolean;
  deafened: boolean;
  camera: boolean;
  streaming: boolean;
  watchedBy: number[];
  online: true;
};

export type OfflineUser = UserData & {
  online: false;
};

export type ConnectedUser = UserData & ConnectedUserState;

export type User = OfflineUser | ConnectedUser;

export type UserAction =
  | {
      type: "action.user.create";
      name: string;
    }
  | ({
      type: "action.user.state";
    } & Partial<Omit<ConnectedUserState, "online">>)
  | ({
      type: "action.user.update";
      id: number;
    } & Partial<UserData>)
  | {
      type: "action.user.delete";
      id: number;
    };

export type UserEvent =
  | {
      type: "event.user.list";
      users: User[];
    }
  | {
      type: "event.user.state";
      user: ConnectedUser;
    }
  | {
      type: "event.user.online";
      userId: number;
    }
  | {
      type: "event.user.offline";
      userId: number;
    }
  | {
      type: "event.user.created";
      user: OfflineUser;
    }
  | {
      type: "event.user.updated";
      user: UserData;
    }
  | {
      type: "event.user.deleted";
      userId: number;
    }
  | {
      type: "event.user.me";
      user: User;
    };
