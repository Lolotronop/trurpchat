import { err, ok } from "neverthrow";
import { send } from "$src/send";
import type { RtcMessage } from "$src/types";
import type { Handlers } from "./types";

export const rtcHandlers: Handlers<RtcMessage> = {
  "rtc.ice": (ctx, ws, msg) => {
    if (msg.target === undefined) {
      return err(new Error("Missing target in rtc.ice message"));
    } else if (msg.sender === undefined) {
      return err(new Error("Missing sender in rtc.ice message"));
    }

    const target = ctx.clients.get(msg.target);
    if (!target) {
      return err(new Error(`Client ${msg.target} not found`));
    }
    send(target, {
      type: "rtc.ice",
      candidate: msg.candidate,
      sender: ws.data.id,
    });
    return ok();
  },

  "rtc.offer": (ctx, ws, msg) => {
    if (msg.target === undefined) {
      return err(new Error("Missing target in rtc.ice message"));
    } else if (msg.sender === undefined) {
      return err(new Error("Missing sender in rtc.ice message"));
    }

    const target = ctx.clients.get(msg.target);
    if (!target) {
      return err(new Error(`Client ${msg.target} not found`));
    }
    send(target, {
      type: "rtc.offer",
      offer: msg.offer,
      sender: ws.data.id,
    });
    return ok();
  },

  "rtc.answer": (ctx, ws, msg) => {
    if (msg.target === undefined) {
      return err(new Error("Missing target in rtc.ice message"));
    } else if (msg.sender === undefined) {
      return err(new Error("Missing sender in rtc.ice message"));
    }

    const target = ctx.clients.get(msg.target);
    if (!target) {
      return err(new Error(`Client ${msg.target} not found`));
    }
    send(target, {
      type: "rtc.answer",
      answer: msg.answer,
      sender: ws.data.id,
    });
    return ok();
  },
};
