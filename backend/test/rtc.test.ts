import { describe, expect, test } from "bun:test";
import { rtcHandlers } from "$src/handler/rtc";
import { createSeededContext, lastSent } from "./helpers";

describe("rtc handlers", () => {
  test("rtc.ice relays ice to the target and rewrites sender", async () => {
    const { ctx, admin, alice } = await createSeededContext();

    const result = await rtcHandlers["rtc.ice"](ctx, admin, {
      type: "rtc.ice",
      target: 2,
      sender: 999,
      candidate: { candidate: "candidate", sdpMid: "0", sdpMLineIndex: 0 },
    });

    expect(result.isOk()).toBe(true);
    expect(lastSent(alice)).toMatchObject({ type: "rtc.ice", sender: 1, target: 2 });
  });

  test("rtc.offer relays offer to the target and rewrites sender", async () => {
    const { ctx, admin, alice } = await createSeededContext();

    const result = await rtcHandlers["rtc.offer"](ctx, admin, {
      type: "rtc.offer",
      target: 2,
      sender: 999,
      offer: { type: "offer", sdp: "sdp" },
    });

    expect(result.isOk()).toBe(true);
    expect(lastSent(alice)).toMatchObject({ type: "rtc.offer", sender: 1, target: 2 });
  });

  test("rtc.answer relays answer to the target and rewrites sender", async () => {
    const { ctx, admin, alice } = await createSeededContext();

    const result = await rtcHandlers["rtc.answer"](ctx, admin, {
      type: "rtc.answer",
      target: 2,
      sender: 999,
      answer: { type: "answer", sdp: "sdp" },
    });

    expect(result.isOk()).toBe(true);
    expect(lastSent(alice)).toMatchObject({ type: "rtc.answer", sender: 1, target: 2 });
  });
});
