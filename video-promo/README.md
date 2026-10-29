# Motion-ролик «Такси Грахово»

Актуальная композиция — **«Закажи в одно касание»**: 32 секунды, 1080 × 1920, 60 fps. Полноэкранная карта с настоящими 3D-зданиями, машиной, меткой назначения и пульсацией местоположения. В сцене водителя — объёмная лупа с читаемым номером. В финале — TAXIGR.RU, одинаковая видимая высота значков RuStore / Google Play и подпись «Доступно в VK, MAX и Telegram».

Изменения от 29.10.2026 доступны в Remotion Studio и проверочных PNG. Файлы MP4 предыдущей сборки ещё не обновлялись. Деловой текст для новой записи находится в `voiceover-business-ru.txt`; исходная аудиодорожка пока сохранена.

## Смотреть

Текущий монтаж: `npm run studio`, композиция `TaxiGrahovoSignature`. Файл предыдущей сборки: `out/signature/taxigr-signature-1080x1920-60fps.mp4`.

```powershell
node scripts/serve-signature.mjs
```

Команда выводит локальный адрес страницы с проигрывателем, главами и скачиванием. Постер: `out/signature/poster.jpg`. Результаты технической проверки: `out/signature/verification.json`.

## Редактировать и собирать

Композиция **TaxiGrahovoSignature** находится в `src/SignaturePromo.tsx`, сценарий и тайминг — в `design-spec-signature.md`.

```powershell
npm run studio
npm run typecheck
npm run render
```

Финальная сборка синтезирует звуковые акценты, рендерит видео, переводит цвет в BT.709, выравнивает громкость, проверяет декодирование и создаёт страницу просмотра. Для сведения и проверки требуется полный FFmpeg с фильтрами `loudnorm` и `zscale`. Путь задаётся через `FFMPEG_PATH`; `FFPROBE_PATH` необязателен. На текущем рабочем компьютере используется локальный FFmpeg из `../tmp/media-tools/imageio_ffmpeg/binaries/`.

Для быстрой проверки монтажа: `npm run preview:signature`. Для кадров сцен: `node scripts/render-signature.mjs frames`.

Прежние ролики и композиции сохранены. Старую минутную горизонтальную версию можно собрать через `npm run render:legacy`.
