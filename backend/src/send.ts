import { stringify } from "devalue";
import { err, ok } from "neverthrow";
import type { Message, ServerEvent } from "./types";
import type { WsClient } from "./voice";

export function safeSend(client: WsClient, message: Message) {
  let str: string;
  try {
    str = stringify(message);
  } catch (error) {
    return err(new Error(`Failed to serialize some data: ${error}`));
  }

  // * - if **0**, the message was **dropped**.
  // * - if **-1**, there is **backpressure** of messages.
  // * - if **>0**, it represents the **number of bytes sent**.
  const status = client.send(str);
  if (status === 0) {
    return err(
      new Error("Message  dropped", {
        cause: {
          clientId: client.data.id,
          message,
        },
      }),
    );
  }

  return ok();
}

export function sendAll(clients: Iterable<WsClient>, message: ServerEvent) {
  for (const client of clients) {
    send(client, message);
  }
}

export function send(client: WsClient, message: ServerEvent) {
  const result = safeSend(client, message);
  if (result.isErr()) {
    console.error("Failed to send message:", result.error);
  }
}
