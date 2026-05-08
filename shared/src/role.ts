import type { Select } from "./utils";

export type RoleData = {
  id: number;
  name: string;
  color: number;
  section: boolean;
  order: number;
  deletedAt: Date | null;
};

export type DbRole = RoleData;

export type UserRoleData = {
  userId: number;
  roleId: number;
};

export type DbUserRole = UserRoleData;

export type Role = Select<
  RoleData,
  "id" | "name" | "color" | "section" | "order"
>;
export type UserRole = Select<UserRoleData, "userId" | "roleId">;

export type RoleCreate = Select<RoleData, "name" | "color"> &
  Partial<Select<RoleData, "section" | "order">>;

export type RoleUpdate = Select<RoleData, "id"> &
  Partial<
    Select<RoleData, "name" | "color" | "section" | "order">
  >;

export type RoleAction =
  | {
      type: "action.role.list";
    }
  | {
      type: "action.role.create";
      role: RoleCreate;
    }
  | {
      type: "action.role.update";
      role: RoleUpdate;
    }
  | {
      type: "action.role.delete";
      id: Role["id"];
    }
  | {
      type: "action.role.assign";
      userId: UserRole["userId"];
      roleId: UserRole["roleId"];
    }
  | {
      type: "action.role.unassign";
      userId: UserRole["userId"];
      roleId: UserRole["roleId"];
    };

export type RoleEvent =
  | {
      type: "event.role.list";
      roles: Role[];
      assignments: UserRole[];
    }
  | {
      type: "event.role.created";
      role: Role;
    }
  | {
      type: "event.role.updated";
      role: Role;
    }
  | {
      type: "event.role.deleted";
      roleId: Role["id"];
    }
  | {
      type: "event.role.assigned";
      userId: UserRole["userId"];
      roleId: UserRole["roleId"];
    }
  | {
      type: "event.role.unassigned";
      userId: UserRole["userId"];
      roleId: UserRole["roleId"];
    };
