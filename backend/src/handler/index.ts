import { err } from "neverthrow";
import type { Message, ClientAction } from "$src/types";
import { type WsClient } from "$src/voice";
import type { HandlerContext } from "./types";
import { rtcHandlers } from "./rtc";
import { voiceHandlers } from "./voice";
import { keyHandlers } from "./key";
import { userHandlers } from "./user";
import { roomHandlers } from "./room";

export type { HandlerContext } from "./types";

const handlers = {
  ...rtcHandlers,
  ...voiceHandlers,
  ...keyHandlers,
  ...userHandlers,
  ...roomHandlers,
} as const;

// TODO: maybe rename rtc to actions too?
const ACTION_PREFIXES = ["action", "rtc"];

function isAction(message: Message): message is ClientAction {
  let allowed = false;
  for (const prefix of ACTION_PREFIXES) {
    if (message.type.startsWith(prefix)) {
      allowed = true;
    }
  }

  return allowed;
}

export async function handleMessage(
  ctx: HandlerContext,
  client: WsClient,
  message: Message,
) {
  if (!isAction(message)) {
    return err(new Error(`Unsupported message type: ${message.type}`));
  }
  message = message;

  const handler = handlers[message.type];
  if (handler === undefined) {
    return err(new Error(`Handler not found for message: ${message.type}`));
  }

  // @ts-expect-error while this does complain about the message type,
  // it is correct as per the checks above
  return await handler(ctx, client, message);
}
