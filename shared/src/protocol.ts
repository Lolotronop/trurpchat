import type { OtherEvent } from "./config";
import type { KeyAction, KeyEvent } from "./key";
import type { MessageAction, MessageEvent } from "./message";
import type { RoleAction, RoleEvent } from "./role";
import type { RoomAction, RoomEvent } from "./room";
import type { RtcMessage } from "./rtc";
import type { TypingAction, TypingEvent } from "./typing";
import type { UserAction, UserEvent } from "./user";
import type { VoiceAction, VoiceEvent } from "./voice";

export type ClientAction =
  | VoiceAction
  | KeyAction
  | RoleAction
  | UserAction
  | RoomAction
  | MessageAction
  | TypingAction
  | RtcMessage;

export type ServerEvent =
  | VoiceEvent
  | KeyEvent
  | RoleEvent
  | UserEvent
  | RtcMessage
  | RoomEvent
  | MessageEvent
  | TypingEvent
  | OtherEvent;

export type Message = ClientAction | ServerEvent;
