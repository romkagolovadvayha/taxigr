import { randomUUID } from 'node:crypto';
export type RealtimeEvent = { sequence: number; rooms: string[]; event: string; payload: unknown; at: number };
export class RealtimeEvents {
  private readonly epoch = randomUUID();
  private sequence = 0;
  private events: RealtimeEvent[] = [];
  publish(room: string, event: string, payload: unknown): void {
    this.publishTo([room],event,payload);
  }
  publishTo(rooms:readonly string[],event:string,payload:unknown):void {
    this.events.push({ sequence: ++this.sequence, rooms:[...new Set(rooms)], event, payload, at: Date.now() });
    this.prune();
  }
  private prune() {
    const minimum = Date.now() - 5 * 60_000;
    this.events = this.events.filter(value => value.at >= minimum).slice(-3000);
  }
  read(cursor: string | undefined, rooms: ReadonlySet<string>) {
    this.prune();
    const [epoch, rawSequence] = (cursor ?? '').split(':');
    const after = Number(rawSequence);
    const oldestRecoverable=this.events[0] ? this.events[0].sequence-1 : this.sequence;
    const reset = epoch !== this.epoch || !Number.isSafeInteger(after) || after > this.sequence || after < oldestRecoverable;
    const selected = reset ? [] : this.events.filter(value => value.sequence > after && value.rooms.some(room=>rooms.has(room)));
    // A bounded page must keep a cursor for its last included event, so an
    // oversized admin burst cannot silently discard subsequent events.
    const page = selected.slice(0, 100);
    const next = page.length < selected.length ? page[page.length - 1]!.sequence : this.sequence;
    return { cursor: `${this.epoch}:${next}`, reset, events: page.map(({ event, payload }) => ({ event, payload })) };
  }
}
