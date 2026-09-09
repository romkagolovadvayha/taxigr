import { Asset } from "expo-asset";
import type { VoicePlayer } from "./voice-player";

export function createVoicePlayer(): VoicePlayer {
  let context: AudioContext | null = null;
  let sourceNode: AudioBufferSourceNode | null = null;
  let loading: AbortController | null = null;
  let request = 0;
  let released = false;
  const buffers = new Map<number, AudioBuffer>();

  const stop = () => {
    request += 1;
    loading?.abort();
    loading = null;
    sourceNode?.stop();
    sourceNode?.disconnect();
    sourceNode = null;
  };

  return {
    async unlock() {
      if (released || typeof window === "undefined") return;
      try {
        const Constructor =
          window.AudioContext ??
          (window as Window & { webkitAudioContext?: typeof AudioContext })
            .webkitAudioContext;
        if (!Constructor) return;
        context ??= new Constructor();
        if (context.state === "suspended") await context.resume();
      } catch {
        // Retry on the next real user gesture if the browser denied audio.
      }
    },
    async play(source, onEnded) {
      stop();
      const activeRequest = request;
      if (released || !context || context.state !== "running") { onEnded?.(); return; }
      try {
        let buffer = buffers.get(source);
        if (!buffer) {
          loading = new AbortController();
          const response = await fetch(Asset.fromModule(source).uri, {
            signal: loading.signal,
          });
          if (!response.ok) { onEnded?.(); return; }
          buffer = await context.decodeAudioData(await response.arrayBuffer());
          if (released || activeRequest !== request) return;
          buffers.set(source, buffer);
        }
        if (activeRequest !== request || context.state !== "running") return;
        const gain = context.createGain();
        gain.gain.value = 0.85;
        gain.connect(context.destination);
        const node = context.createBufferSource();
        node.buffer = buffer;
        node.connect(gain);
        node.onended = () => {
          node.disconnect();
          gain.disconnect();
          if (sourceNode === node) sourceNode = null;
          if (activeRequest === request) onEnded?.();
        };
        sourceNode = node;
        node.start();
      } catch {
        if (activeRequest === request) onEnded?.();
        // Abort, autoplay denial and offline asset failures are non-fatal.
      }
    },
    stop,
    release() {
      stop();
      released = true;
      buffers.clear();
      void context?.close().catch(() => undefined);
      context = null;
    },
  };
}
