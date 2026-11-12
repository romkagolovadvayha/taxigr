export type RelayMessage = {
  timestamp?: number;
  sender?: { user_id?: number };
  recipient?: { chat_id?: number | string };
  body?: { mid?: string; text?: string };
};

export class RelayTransportUnavailable extends Error {
  constructor(message: string, public readonly retryAfterMs: number) { super(message); }
}

export interface RelayMessageTransport {
  verifyRecipient(signal?: AbortSignal): Promise<void>;
  send(text: string, signal?: AbortSignal): Promise<string>;
  edit(mid: string, text: string): Promise<void>;
  read(mids: string[], signal?: AbortSignal): Promise<RelayMessage[]>;
  history(before?: number): Promise<RelayMessage[]>;
  nextHistoryCursor?(batch: RelayMessage[]): number;
}
