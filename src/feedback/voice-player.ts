import {
  createAudioPlayer,
  setAudioModeAsync,
  type AudioPlayer,
} from "expo-audio";

export type VoicePlayer = {
  unlock: () => Promise<void>;
  play: (source: number, onEnded?: () => void) => Promise<void>;
  stop: () => void;
  release: () => void;
};

export function createVoicePlayer(): VoicePlayer {
  let player: AudioPlayer | null = null;
  let mode: Promise<void> | null = null;
  let request = 0;
  let released = false;
  let completion: { remove: () => void } | null = null;
  const stop = () => {
    request += 1;
    completion?.remove();
    completion = null;
    player?.pause();
  };
  return {
    unlock: async () => {},
    async play(source, onEnded) {
      stop();
      const activeRequest = request;
      try {
        mode ??= setAudioModeAsync({
          playsInSilentMode: false,
          interruptionMode: "duckOthers",
          allowsRecording: false,
          shouldPlayInBackground: false,
          shouldRouteThroughEarpiece: false,
        }).catch((error) => {
          mode = null;
          throw error;
        });
        await mode;
        if (released || activeRequest !== request) return;
        player ??= createAudioPlayer(null);
        player.replace(source);
        completion = player.addListener('playbackStatusUpdate', (status) => {
          if (status.didJustFinish && activeRequest === request) {
            completion?.remove();
            completion = null;
            onEnded?.();
          }
        });
        player.volume = 0.85;
        player.play();
      } catch {
        if (activeRequest === request) onEnded?.();
        // A muted device or unavailable audio session must not interrupt booking.
      }
    },
    stop,
    release() {
      stop();
      released = true;
      player?.release();
      player = null;
    },
  };
}
