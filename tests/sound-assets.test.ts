import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';
import manifest from '../assets/sounds/voice-manifest.json';

const soundFiles = Object.keys(manifest.clips).map(name => `${name}.wav`);

describe.each(soundFiles)('%s', (filename) => {
  it('is a short, normalized voice notification without clipped boundaries', async () => {
    // The optional price explanation contains both choices and is longer than a status alert.
    const isPriceExplanation = filename === 'search_price_increase_offer.wav';
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
    expect(sampleCount / sampleRate).toBeLessThanOrEqual(isPriceExplanation ? 15 : 12);
    expect(wav.length).toBeLessThan(isPriceExplanation ? 1_400_000 : 1_100_000);
    const mp3 = await readFile(resolve(process.cwd(), 'assets', 'sounds', filename.replace('.wav', '.mp3')));
    expect(mp3.length).toBeLessThan(isPriceExplanation ? 125_000 : 100_000);
    expect(mp3.length).toBeLessThan(wav.length / 7);
    expect(wav.readUInt32LE(40)).toBe(wav.length - 44);
    expect(20 * Math.log10(peak)).toBeCloseTo(-3.5, 1);
    expect(wav.readInt16LE(44)).toBe(0);
    expect(wav.readInt16LE(wav.length - 2)).toBe(0);
    // Quiet padding leaves consonants intact and avoids clicks on playback.
    expect(wav.subarray(44, 44 + 2 * Math.round(sampleRate * 0.08)).every((byte) => byte === 0)).toBe(true);
  });
});
