import { err, ok } from "neverthrow";
import type { Message } from "./types";
import type { WsClient } from "./voice";

export function safeSend(client: WsClient, message: Message) {
  let str: string;
  try {
    str = JSON.stringify(message);
  } catch (error) {
    return err(new Error(`Failed to serialize some data: ${error}`));
  }

  // * - if **0**, the message was **dropped**.
  // * - if **-1**, there is **backpressure** of messages.
  // * - if **>0**, it represents the **number of bytes sent**.
  const status = client.send(str);
  if (status === 0) {
    return err(new Error("Message  dropped"));
  }

  return ok();
}

export function sendAll(clients: Iterable<WsClient>, message: Message) {
  for (const client of clients) {
    send(client, message);
  }
}

export function send(client: WsClient, message: Message) {
  const result = safeSend(client, message);
  if (result.isErr()) {
    console.error("Failed to send message:", result.error);
  }
}
