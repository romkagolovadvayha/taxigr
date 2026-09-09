import type { VoicePlayer } from './voice-player';

// Different orders and chat speak in sequence. A newer status of the same order
// replaces its obsolete phrase, so cancellation never waits behind "driver found".
export function createVoiceQueue(player: VoicePlayer) {
  type Item = { source: number; group: string; expires: number };
  let current: Item | null = null;
  let pending: Item[] = [];
  let generation = 0;
  let watchdog: ReturnType<typeof setTimeout> | undefined;
  let released = false;
  const start = async (item: Item): Promise<void> => {
    current = item;
    const active = ++generation;
    const done = () => {
      if (active !== generation || released) return;
      ++generation;
      clearTimeout(watchdog);
      current = null;
      pending = pending.filter(next => next.expires > Date.now());
      const next = pending.shift();
      if (next) void start(next);
    };
    // Also recover if a platform never reports an interrupted/failed audio session.
    watchdog = setTimeout(() => { if (active === generation) { player.stop(); done(); } }, 25_000);
    try { await player.play(item.source, done); } catch { done(); }
  };
  const stop = () => {
    ++generation;
    clearTimeout(watchdog);
    pending = [];
    current = null;
    player.stop();
  };
  return {
    unlock: () => player.unlock(),
    async play(source: number, group = 'preview') {
      if (released) return;
      const item = { source, group, expires: Date.now() + 30_000 };
      pending = pending.filter(next => next.group !== group && next.expires > Date.now());
      if (current?.group === group) {
        ++generation;
        clearTimeout(watchdog);
        player.stop();
        current = null;
      }
      if (!current) await start(item);
      else { pending = pending.slice(-11); pending.push(item); }
    },
    stop,
    release() { stop(); released = true; player.release(); },
  };
}
