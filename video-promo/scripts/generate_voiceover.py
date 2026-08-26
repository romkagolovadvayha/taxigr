import asyncio
from pathlib import Path

import edge_tts


VOICE = "ru-RU-SvetlanaNeural"
RATE = "+30%"
PITCH = "-2Hz"
OUTPUT = Path(__file__).resolve().parents[1] / "public" / "audio" / "voiceover" / "fast-portrait"

LINES = {
    "01-hook.mp3": "Нужно такси? Тогда вы по адресу.",
    "02-order.mp3": "Выберите, куда ехать, и нажмите «Заказать».",
    "03-driver.mp3": "Водитель найден. Дмитрий уже едет к вам.",
    "04-map.mp3": "Следите за машиной на карте — до самой точки назначения.",
    "05-rating.mp3": "Поездка завершена. Пять звёзд — и отзыв в одно движение.",
    "06-outro.mp3": "Заказать такси — просто. Скачивайте приложение.",
}


async def main() -> None:
    OUTPUT.mkdir(parents=True, exist_ok=True)
    for filename, text in LINES.items():
        communicator = edge_tts.Communicate(text, VOICE, rate=RATE, pitch=PITCH)
        await communicator.save(str(OUTPUT / filename))
        print(f"generated {filename}")


if __name__ == "__main__":
    asyncio.run(main())
