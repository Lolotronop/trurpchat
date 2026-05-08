import type { Result } from "neverthrow";
import type { Message, PermissionMask, SharedState } from "trurpchat-shared";
import { Permission, perm, user } from "trurpchat-shared";
import type { WsClient } from "$src/voice";

export type MessageNames<T extends { type: string }> = {
  [K in keyof T]: T[K];
}["type"];

export type HandlerContext = {
  clients: Map<number, WsClient>;
  state: SharedState;
};

export type HandlerFunction<T extends Message> = (
  ctx: HandlerContext,
  ws: WsClient,
  msg: T,
) => Result<void, Error> | Promise<Result<void, Error>>;

export type Handlers<T extends Message> = {
  [K in MessageNames<T>]: HandlerFunction<Extract<T, { type: K }>>;
};

export function sessionUser(ctx: HandlerContext, ws: WsClient) {
  const found = user(ctx.state, ws.data.userId);
  if (!found) {
    throw new Error(`User ${ws.data.userId} not found in shared state`);
  }
  return found;
}

export function canSession(
  ctx: HandlerContext,
  ws: WsClient,
  required: PermissionMask,
  roomId?: number,
) {
  return perm.can(ctx.state, required, ws.data.userId, roomId);
}

export function isSessionAdmin(ctx: HandlerContext, ws: WsClient) {
  return canSession(ctx, ws, Permission.ADMIN);
}
