"""Generate the fixed, non-personal Russian narration sources, then keep them offline."""
import asyncio
import json
from pathlib import Path

import edge_tts

ROOT = Path(__file__).resolve().parents[1]
MANIFEST = json.loads((ROOT / "assets/sounds/voice-manifest.json").read_text(encoding="utf-8"))
OUTPUT = ROOT / "assets/sounds/voice-source"


async def main() -> None:
    OUTPUT.mkdir(parents=True, exist_ok=True)
    previous_file = OUTPUT / "recording.json"
    previous = json.loads(previous_file.read_text(encoding="utf-8")) if previous_file.exists() else {}
    same_voice = all(previous.get(key) == MANIFEST.get(key) for key in ("voice", "rate", "pitch"))
    for name, text in MANIFEST["clips"].items():
        if same_voice and previous.get("clips", {}).get(name) == text and (OUTPUT / f"{name}.mp3").exists():
            continue
        for attempt in range(3):
            try:
                speech = edge_tts.Communicate(
                    text, MANIFEST["voice"], rate=MANIFEST["rate"], pitch=MANIFEST["pitch"]
                )
                await speech.save(str(OUTPUT / f"{name}.mp3"))
                print(f"Recorded {name}", flush=True)
                break
            except Exception:
                if attempt == 2:
                    raise
                await asyncio.sleep(2)
    (OUTPUT / "recording.json").write_text(
        json.dumps(MANIFEST, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )


if __name__ == "__main__":
    asyncio.run(main())
