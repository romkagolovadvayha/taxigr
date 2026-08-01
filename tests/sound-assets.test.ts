import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

const soundFiles = [
  'taxi_found.wav',
  'driver_arrived.wav',
  'new_order.wav',
  'ride_started.wav',
  'ride_complete.wav',
  'ride_cancelled.wav',
];

describe.each(soundFiles)('%s', (filename) => {
  it('is a compact, normalized notification WAV', async () => {
    const wav = await readFile(resolve(process.cwd(), 'assets', 'sounds', filename));
    const sampleRate = wav.readUInt32LE(24);
    const channels = wav.readUInt16LE(22);
    const bitsPerSample = wav.readUInt16LE(34);
    const sampleCount = wav.readUInt32LE(40) / (bitsPerSample / 8);
    let peak = 0;

    for (let offset = 44; offset < wav.length; offset += 2) {
      peak = Math.max(peak, Math.abs(wav.readInt16LE(offset) / 32_768));
    }

    expect(wav.toString('ascii', 0, 4)).toBe('RIFF');
    expect(wav.toString('ascii', 8, 12)).toBe('WAVE');
    expect(sampleRate).toBe(44_100);
    expect(channels).toBe(1);
    expect(bitsPerSample).toBe(16);
    expect(sampleCount / sampleRate).toBeGreaterThanOrEqual(0.7);
    expect(sampleCount / sampleRate).toBeLessThanOrEqual(1.25);
    expect(20 * Math.log10(peak)).toBeCloseTo(-3.5, 1);
    expect(wav.readInt16LE(44)).toBe(0);
    expect(wav.readInt16LE(wav.length - 2)).toBe(0);
  });
});
