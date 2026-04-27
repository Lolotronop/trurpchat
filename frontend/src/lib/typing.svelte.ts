export type TypingEntry = {
  roomId: number;
  userId: number;
  timestamp: Date;
};

export class TypingStore {
  entries: TypingEntry[] = $state([]);

  set(roomId: number, userId: number, timestamp: Date) {
    const existing = this.entries.find(
      (entry) => entry.roomId === roomId && entry.userId === userId,
    );

    if (existing) {
      existing.timestamp = timestamp;
      return;
    }

    this.entries.push({ roomId, userId, timestamp });
  }
}
