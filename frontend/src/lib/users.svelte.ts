import type {
  ConnectedUser,
  OfflineUser,
  Role,
  SharedState,
  User,
} from "trurpchat-shared";

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

function resolveUsername(user: User) {
  if (user.displayName && user.displayName.length > 0) {
    return user.displayName;
  }

  return user.name;
}

export function toColorHex(color: number) {
  return `#${color.toString(16).padStart(6, "0")}`;
}

export class UserStore {
  constructor(readonly state: SharedState) {}

  roles: RoleWithColorHex[] = $derived.by(() => {
    return this.state.roles.map((role) => ({
      ...role,
      colorHex: toColorHex(role.color),
    }));
  });

  #rolesById = $derived.by(() => {
    return new Map(this.roles.map((role) => [role.id, role]));
  });

  #rolesByUserId = $derived.by(() => {
    const byUserId = new Map<number, RoleWithColorHex[]>();

    for (const assignment of this.state.userRoles) {
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
    return this.state.users.map((user) => {
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
}
