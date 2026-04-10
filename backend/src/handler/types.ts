import type { Result } from "neverthrow";
import type { Message } from "$src/types";
import type { Hotel, WsClient } from "$src/voice";

export type MessageNames<T extends { type: string }> = {
  [K in keyof T]: T[K];
}["type"];

export type HandlerContext = {
  clients: Map<number, WsClient>;
  hotel: Hotel;
};

export type HandlerFunction<T extends Message> = (
  ctx: HandlerContext,
  ws: WsClient,
  msg: T,
) => Result<void, Error> | Promise<Result<void, Error>>;

export type Handlers<T extends Message> = {
  [K in MessageNames<T>]: HandlerFunction<Extract<T, { type: K }>>;
};
