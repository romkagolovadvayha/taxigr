import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const outputDirectory = resolve(root, 'assets', 'sounds');

// Mono PCM WAV is intentionally used here: it is small, plays everywhere Expo
// Audio does, and can also be bundled as a native notification sound.
const sampleRate = 44_100;
const targetPeak = 10 ** (-3.5 / 20);

const timbres = {
  soft: {
    partials: [
      [1, 1],
      [2, 0.2],
      [3, 0.055],
      [4.02, 0.018],
    ],
    decay: 3.2,
    noise: 0.006,
  },
  clear: {
    partials: [
      [1, 1],
      [2, 0.27],
      [3, 0.09],
      [4.01, 0.035],
      [5.98, 0.012],
    ],
    decay: 2.8,
    noise: 0.01,
  },
  warm: {
    partials: [
      [1, 1],
      [2, 0.14],
      [3, 0.035],
    ],
    decay: 3.8,
    noise: 0.003,
  },
};

const soundDesigns = {
  // A short, optimistic major arpeggio: noticeable but not triumphant.
  'taxi_found.wav': {
    duration: 0.94,
    notes: [
      { at: 0, midi: 64, length: 0.52, gain: 0.78, timbre: 'soft' },
      { at: 0.15, midi: 67, length: 0.56, gain: 0.72, timbre: 'soft' },
      { at: 0.31, midi: 72, length: 0.58, gain: 0.76, timbre: 'clear' },
    ],
  },
  // Two deliberate calls followed by a settled high note.
  'driver_arrived.wav': {
    duration: 1.04,
    notes: [
      { at: 0, midi: 67, length: 0.42, gain: 0.72, timbre: 'clear' },
      { at: 0.22, midi: 67, length: 0.42, gain: 0.66, timbre: 'clear' },
      { at: 0.46, midi: 72, length: 0.54, gain: 0.8, timbre: 'soft' },
    ],
  },
  // The driver's alert is the most rhythmic sound, so it cuts through road noise
  // without relying on an unpleasant high pitch.
  'new_order.wav': {
    duration: 1.2,
    notes: [
      { at: 0, midi: 57, length: 0.31, gain: 0.62, timbre: 'warm' },
      { at: 0, midi: 64, length: 0.31, gain: 0.64, timbre: 'clear' },
      { at: 0.31, midi: 60, length: 0.34, gain: 0.66, timbre: 'warm' },
      { at: 0.31, midi: 67, length: 0.34, gain: 0.7, timbre: 'clear' },
      { at: 0.65, midi: 64, length: 0.49, gain: 0.72, timbre: 'soft' },
      { at: 0.65, midi: 72, length: 0.49, gain: 0.78, timbre: 'clear' },
    ],
  },
  // A compact "go" gesture for the transition from waiting to driving.
  'ride_started.wav': {
    duration: 0.76,
    notes: [
      { at: 0, midi: 55, length: 0.4, gain: 0.7, timbre: 'warm' },
      { at: 0.13, midi: 60, length: 0.42, gain: 0.73, timbre: 'soft' },
      { at: 0.27, midi: 67, length: 0.45, gain: 0.7, timbre: 'soft' },
    ],
  },
  // A resolved cadence, softer and less urgent than the order alerts.
  'ride_complete.wav': {
    duration: 1.02,
    notes: [
      { at: 0, midi: 60, length: 0.52, gain: 0.66, timbre: 'warm' },
      { at: 0.16, midi: 64, length: 0.55, gain: 0.64, timbre: 'soft' },
      { at: 0.32, midi: 67, length: 0.62, gain: 0.68, timbre: 'soft' },
      { at: 0.47, midi: 72, length: 0.5, gain: 0.54, timbre: 'clear' },
    ],
  },
  // Descending, but intentionally neutral rather than a harsh error buzzer.
  'ride_cancelled.wav': {
    duration: 0.88,
    notes: [
      { at: 0, midi: 64, length: 0.43, gain: 0.65, timbre: 'warm' },
      { at: 0.2, midi: 60, length: 0.43, gain: 0.69, timbre: 'warm' },
      { at: 0.4, midi: 55, length: 0.44, gain: 0.72, timbre: 'warm' },
    ],
  },
};

function midiToFrequency(midi) {
  return 440 * 2 ** ((midi - 69) / 12);
}

function deterministicNoise(sampleIndex, noteIndex) {
  const value = Math.sin((sampleIndex + 1) * 12.9898 + noteIndex * 78.233) * 43_758.5453;
  return (value - Math.floor(value)) * 2 - 1;
}

function noteEnvelope(time, length, decay) {
  const attack = 1 - Math.exp(-time * 115);
  const body = Math.exp(-time * decay);
  const releaseStart = Math.max(0, length - 0.11);
  const release =
    time <= releaseStart
      ? 1
      : Math.cos(((time - releaseStart) / (length - releaseStart)) * (Math.PI / 2)) ** 2;
  return attack * body * release;
}

function renderSound({ duration, notes }) {
  const sampleCount = Math.ceil(duration * sampleRate);
  const samples = new Float64Array(sampleCount);

  notes.forEach((note, noteIndex) => {
    const frequency = midiToFrequency(note.midi);
    const timbre = timbres[note.timbre];
    const startSample = Math.floor(note.at * sampleRate);
    const endSample = Math.min(sampleCount, Math.ceil((note.at + note.length) * sampleRate));

    for (let index = startSample; index < endSample; index += 1) {
      const time = index / sampleRate - note.at;
      const envelope = noteEnvelope(time, note.length, timbre.decay);
      // A tiny downward pitch relaxation gives the notes a struck, physical feel.
      const phase = 2 * Math.PI * frequency * (time + 0.0014 * (1 - Math.exp(-time * 25)));
      let voice = 0;

      for (const [ratio, level] of timbre.partials) {
        const partialDecay = Math.exp(-time * Math.max(0, ratio - 1) * 2.2);
        voice += Math.sin(phase * ratio) * level * partialDecay;
      }

      const transient = deterministicNoise(index, noteIndex) * timbre.noise * Math.exp(-time * 42);
      samples[index] += (voice + transient) * envelope * note.gain;
    }
  });

  // Gentle saturation handles overlapping notes, then all files are peak-matched
  // so changing event type never produces a surprise volume jump.
  let peak = 0;
  for (let index = 0; index < samples.length; index += 1) {
    const time = index / sampleRate;
    const fadeIn = Math.min(1, time / 0.006);
    const fadeOut = Math.min(1, Math.max(0, duration - time) / 0.045);
    samples[index] = Math.tanh(samples[index] * 0.72) * fadeIn * fadeOut;
    peak = Math.max(peak, Math.abs(samples[index]));
  }

  const normalization = peak > 0 ? targetPeak / peak : 1;
  const pcm = Buffer.alloc(sampleCount * 2);
  for (let index = 0; index < sampleCount; index += 1) {
    const sample = Math.max(-1, Math.min(1, samples[index] * normalization));
    pcm.writeInt16LE(Math.round(sample * 32_767), index * 2);
  }

  return createWaveFile(pcm);
}

function createWaveFile(pcm) {
  const header = Buffer.alloc(44);
  const bytesPerSample = 2;
  const byteRate = sampleRate * bytesPerSample;
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + pcm.length, 4);
  header.write('WAVE', 8);
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(bytesPerSample, 32);
  header.writeUInt16LE(16, 34);
  header.write('data', 36);
  header.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([header, pcm]);
}

await mkdir(outputDirectory, { recursive: true });
await Promise.all(
  Object.entries(soundDesigns).map(([filename, design]) =>
    writeFile(resolve(outputDirectory, filename), renderSound(design)),
  ),
);

console.log(
  `Generated ${Object.keys(soundDesigns).length} polished notification sounds in ${outputDirectory}`,
);
