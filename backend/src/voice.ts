import type { ServerWebSocket } from "bun";
import type { SharedState } from "trurpchat-shared";

export type WsData = { userId: number };
export type WsClient = ServerWebSocket<WsData>;

export function voiceRoomByUserId(state: SharedState, userId: number) {
  return state.voiceUsers.find((entry) => entry.userId === userId);
}

export function voiceClientsInRoom(
  state: SharedState,
  clients: Map<number, WsClient>,
  roomId: number,
) {
  return state.voiceUsers
    .filter((entry) => entry.roomId === roomId)
    .flatMap((entry) => {
      const client = clients.get(entry.userId);
      return client ? [client] : [];
    });
}
