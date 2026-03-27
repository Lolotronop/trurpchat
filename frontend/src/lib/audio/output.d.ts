interface AudioContext {
  sinkId?: string;
  setSinkId(sinkId: string): Promise<void>;
}
