import type {
  ConnectedUser,
  ConnectedUserState,
  DbUser,
  OfflineUser,
  Role,
  User,
  UserRole,
} from "trurpchat-backend";

export type RoleWithColorHex = Role & {
  colorHex: string;
};

type UserComputedFields = {
  roles: RoleWithColorHex[];
  username: string;
  colorHex: string | undefined;
};

export type UserWithRoles = User & UserComputedFields;

export type ConnectedUserWithRoles = ConnectedUser & UserComputedFields;

export type OfflineUserWithRoles = OfflineUser & UserComputedFields;

function createDefaultConnectedUserState(): ConnectedUserState {
  return {
    muted: false,
    deafened: false,
    camera: false,
    streaming: false,
    watchedBy: [],
    online: true,
  };
}

function patchUser(base: User, patch: DbUser): User {
  if (!base.online) {
    return toOfflineUser(patch);
  }

  return {
    ...base,
    ...patch,
    online: true,
  };
}

function toOfflineUser(user: DbUser): OfflineUser {
  return {
    ...user,
    online: false,
  };
}

function resolveUsername(user: User) {
  if (user.displayName && user.displayName.length > 0) {
    return user.displayName;
  }

  return user.name;
}

function toColorHex(color: number) {
  return `#${color.toString(16).padStart(6, "0")}`;
}

export class UserStore {
  rawUsers: User[] = $state([]);
  rawRoles: Role[] = $state([]);
  roleAssignments: UserRole[] = $state([]);

  roles: RoleWithColorHex[] = $derived.by(() => {
    return this.rawRoles.map((role) => ({
      ...role,
      colorHex: toColorHex(role.color),
    }));
  });

  #rolesById = $derived.by(() => {
    return new Map(this.roles.map((role) => [role.id, role]));
  });

  #rolesByUserId = $derived.by(() => {
    const byUserId = new Map<number, RoleWithColorHex[]>();

    for (const assignment of this.roleAssignments) {
      const role = this.#rolesById.get(assignment.roleId);
      if (!role) {
        continue;
      }

      const existing = byUserId.get(assignment.userId);
      if (existing) {
        existing.push(role);
      } else {
        byUserId.set(assignment.userId, [role]);
      }
    }

    return byUserId;
  });

  list: UserWithRoles[] = $derived.by(() => {
    return this.rawUsers.map((user) => {
      const roles = [...(this.#rolesByUserId.get(user.id) ?? [])].sort(
        (a, b) => b.order - a.order,
      );
      const primaryRole = roles[0];

      return {
        ...user,
        roles,
        username: resolveUsername(user),
        colorHex: primaryRole?.colorHex,
      };
    });
  });

  online = $derived.by(() => {
    return this.list.filter(
      (user): user is ConnectedUserWithRoles => user.online,
    );
  });

  offline = $derived.by(() => {
    return this.list.filter(
      (user): user is OfflineUserWithRoles => !user.online,
    );
  });

  find(id: number) {
    return this.list.find((user) => user.id === id);
  }

  findRole(id: number) {
    return this.roles.find((role) => role.id === id);
  }

  setUsers(users: User[]) {
    this.rawUsers = users;
  }

  setRoles(roles: Role[], roleAssignments: UserRole[]) {
    this.rawRoles = roles;
    this.roleAssignments = roleAssignments;
  }

  setUserOnline(userId: number) {
    const userIndex = this.rawUsers.findIndex((user) => user.id === userId);
    if (userIndex === -1) {
      return;
    }

    const user = this.rawUsers[userIndex];
    if (!user || user.online) {
      return;
    }

    this.rawUsers[userIndex] = {
      ...user,
      ...createDefaultConnectedUserState(),
    };
  }

  setUserOffline(userId: number) {
    const userIndex = this.rawUsers.findIndex((user) => user.id === userId);
    if (userIndex === -1) {
      return;
    }

    const user = this.rawUsers[userIndex];
    if (!user || !user.online) {
      return;
    }

    this.rawUsers[userIndex] = toOfflineUser(user);
  }

  upsertCreatedUser(user: OfflineUser) {
    const userIndex = this.rawUsers.findIndex(
      (existing) => existing.id === user.id,
    );
    if (userIndex === -1) {
      this.rawUsers.push(user);
    } else {
      this.rawUsers[userIndex] = user;
    }
  }

  patchDbUser(user: DbUser) {
    const userIndex = this.rawUsers.findIndex(
      (existing) => existing.id === user.id,
    );
    if (userIndex === -1) {
      this.rawUsers.push(toOfflineUser(user));
      return;
    }

    const existingUser = this.rawUsers[userIndex];
    if (!existingUser) {
      return;
    }

    this.rawUsers[userIndex] = patchUser(existingUser, user);
  }

  setUserState(user: ConnectedUser) {
    const userIndex = this.rawUsers.findIndex(
      (existing) => existing.id === user.id,
    );
    if (userIndex === -1) {
      this.rawUsers.push(user);
      return;
    }

    this.rawUsers[userIndex] = user;
  }

  deleteUser(userId: number) {
    const userIndex = this.rawUsers.findIndex((user) => user.id === userId);
    if (userIndex !== -1) {
      this.rawUsers.splice(userIndex, 1);
    }

    this.roleAssignments = this.roleAssignments.filter(
      (assignment) => assignment.userId !== userId,
    );
  }

  createRole(role: Role) {
    this.rawRoles.push(role);
  }

  updateRole(role: Role) {
    const roleIndex = this.rawRoles.findIndex(
      (existing) => existing.id === role.id,
    );
    if (roleIndex === -1) {
      this.rawRoles.push(role);
      return;
    }

    Object.assign(this.rawRoles[roleIndex], role);
  }

  deleteRole(roleId: number) {
    const roleIndex = this.rawRoles.findIndex((role) => role.id === roleId);
    if (roleIndex !== -1) {
      this.rawRoles.splice(roleIndex, 1);
    }

    this.roleAssignments = this.roleAssignments.filter(
      (assignment) => assignment.roleId !== roleId,
    );
  }

  assignRole(userId: number, roleId: number) {
    const existing = this.roleAssignments.find(
      (assignment) =>
        assignment.userId === userId && assignment.roleId === roleId,
    );
    if (existing) {
      return;
    }

    this.roleAssignments.push({ userId, roleId });
  }

  unassignRole(userId: number, roleId: number) {
    const assignmentIndex = this.roleAssignments.findIndex(
      (assignment) =>
        assignment.userId === userId && assignment.roleId === roleId,
    );
    if (assignmentIndex === -1) {
      return;
    }

    this.roleAssignments.splice(assignmentIndex, 1);
  }
}
