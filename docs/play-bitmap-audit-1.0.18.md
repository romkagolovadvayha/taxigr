# Проверка рекомендации Google Play о растровых изображениях

Проверен именно загруженный в Google Play AAB 1.0.18 (38), SHA-256
`d8b409ca4ed15d3c0e83aff60cf43f7c7ed9fdb10743ba1907520cfd3b5a20e8`.
Имена восстановлены по встроенному `proguard.map`. После объединения и
встраивания методов R8 имя класса может отличаться от владельца исходного кода.

| Метод из отчёта | Исходный код |
| --- | --- |
| `E4.t.c` | Glide: `GlideBitmapFactory.decodeStream` и декодирование hardware bitmap с gainmap; метод встроен в `DrawableToBitmapConverter` |
| `T4.g.h`, `T4.g.i` | CanHub Cropper: `BitmapUtils.decodeImage`, `decodeSampledBitmap`, чтение размеров |
| `V7.l.draw` | AndroidAnimation: APNG/WebP `StillFrame.draw` |
| `g6.a.d` | Fresco: `ArtDecoder` / `DefaultDecoder` |
| `g8.k.p` | AndroidAnimation: `WebPDecoder` |
| `k6.e.d` | Fresco: `SimpleImageTranscoder` |
| `com.bumptech.glide.load.data.j.f` | Glide: `HttpUrlFetcher` |
| `L2.t.m` | AndroidX Media3: `DefaultHttpDataSource.open` |
| `A8.l.run` | Несколько объединённых R8 задач, включая Google Cloud Messaging; без номера строки нельзя приписать весь метод одному исходному классу |

Все перечисленные пути находятся в зависимостях. Сам факт присутствия
`BitmapFactory` внутри библиотеки не означает, что приложение должно перейти на
другую библиотеку. [Android рекомендует Glide и Fresco для загрузки изображений](https://developer.android.com/topic/performance/graphics/load-bitmap).

В приложении изображения отображает `expo-image` через Glide. В Android-коде
Expo подтверждены downsampling под размер представления, кеш и использование
`Glide.submit(maxWidth, maxHeight)` в `Image.loadAsync`. Подготовка загружаемых
фотографий ограничена 2048 px для чата и 512 px для аватара. Повторное сжатие
использует уже уменьшенное изображение; ссылки освобождаются в `finally`.
Личные фотографии чата сохраняют запрет дискового кеширования.

Это аудит исходного кода и артефакта, а не измерение памяти на устройстве.
Он не доказывает отсутствие всех проблем в декодерах зависимостей и не позволяет
объявить рекомендацию Google Play ложной либо устранённой. Для этого нужны
конкретный сценарий воспроизведения и профиль памяти либо новый отчёт Play.
Полная расшифровка сохранена в `tmp/android15-audit/bitmap-map.json`.

В том же AAB `r8.json` подтверждает включённые оптимизацию, shrinking,
обфускацию и оптимизированное удаление ресурсов, R8 8.12.14. Отдельное требование
Play обновить AGP до 9.0+ относится к версии инструментария, а не к выключенному R8.
