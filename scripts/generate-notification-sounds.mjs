import { mkdir, readFile, writeFile } from "node:fs/promises";
import { Buffer } from "node:buffer";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const output = resolve(root, "assets/sounds");
const manifest = JSON.parse(
  await readFile(resolve(output, "voice-manifest.json"), "utf8"),
);
const recorded = JSON.parse(
  await readFile(resolve(output, "voice-source/recording.json"), "utf8"),
);
if (JSON.stringify(manifest) !== JSON.stringify(recorded)) {
  throw new Error(
    "Voice copy changed. Run python scripts/record-notification-voice.py first.",
  );
}
const sampleRate = 44100;
const peakTarget = 10 ** (-3.5 / 20);
const stats = [];
await mkdir(output, { recursive: true });

for (const [name, text] of Object.entries(manifest.clips)) {
  const speech = spawnSync(
    process.env.FFMPEG_PATH || "ffmpeg",
    [
      "-v",
      "error",
      "-i",
      resolve(output, "voice-source", `${name}.mp3`),
      "-af",
      "silenceremove=start_periods=1:start_duration=0.02:start_threshold=-48dB,areverse,silenceremove=start_periods=1:start_duration=0.02:start_threshold=-48dB,areverse,highpass=f=70,loudnorm=I=-18:TP=-3.5:LRA=7",
      "-ar",
      String(sampleRate),
      "-ac",
      "1",
      "-f",
      "f32le",
      "pipe:1",
    ],
    { maxBuffer: 8 * 1024 * 1024, windowsHide: true },
  );
  if (speech.error || speech.status !== 0)
    throw speech.error || new Error(speech.stderr.toString());
  const frames = speech.stdout.length / 4;
  if (frames < sampleRate / 2)
    throw new Error(`Empty or truncated speech: ${name}`);
  const lead = Math.round(sampleRate * 0.09);
  const tail = Math.round(sampleRate * 0.18);
  const pcm = Buffer.alloc((frames + lead + tail) * 2);
  let peak = 0;
  for (let i = 0; i < frames; i++)
    peak = Math.max(peak, Math.abs(speech.stdout.readFloatLE(i * 4)));
  for (let i = 0; i < frames; i++) {
    const fade = Math.min(
      1,
      i / (sampleRate * 0.008),
      (frames - 1 - i) / (sampleRate * 0.012),
    );
    const value =
      ((speech.stdout.readFloatLE(i * 4) * peakTarget) / peak) * fade;
    pcm.writeInt16LE(
      Math.round(Math.max(-1, Math.min(1, value)) * 32767),
      (lead + i) * 2,
    );
  }
  const header = Buffer.alloc(44);
  header.write("RIFF");
  header.writeUInt32LE(36 + pcm.length, 4);
  header.write("WAVE", 8);
  header.write("fmt ", 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(sampleRate * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write("data", 36);
  header.writeUInt32LE(pcm.length, 40);
  await writeFile(resolve(output, `${name}.wav`), Buffer.concat([header, pcm]));
  // Small runtime files for web/native playback; WAV remains bundled for OS push sounds.
  const encoded = spawnSync(process.env.FFMPEG_PATH || "ffmpeg", [
    "-v", "error", "-y", "-i", resolve(output, `${name}.wav`),
    "-codec:a", "libmp3lame", "-b:a", "64k", "-ar", "24000", "-ac", "1",
    resolve(output, `${name}.mp3`),
  ], { windowsHide: true });
  if (encoded.error || encoded.status !== 0)
    throw encoded.error || new Error(encoded.stderr.toString());
  stats.push({
    file: `${name}.wav`,
    text,
    seconds: Number((pcm.length / 2 / sampleRate).toFixed(2)),
    bytes: pcm.length + 44,
  });
}
await writeFile(
  resolve(output, "voice-metadata.json"),
  JSON.stringify(
    { voice: manifest.voice, synthetic: true, clips: stats },
    null,
    2,
  ) + "\n",
);
console.log(JSON.stringify(stats, null, 2));
