import type { SharedState, TypingEvent } from "trurpchat-shared";

export type TypingEntry = TypingEvent;

export class TypingStore {
  constructor(readonly state: SharedState) {}

  get entries() {
    return this.state.typing;
  }
}
