# Такси Грахово

Единое приложение локального такси для web, iOS и Android. В репозитории находятся пассажирский интерфейс, кабинет водителя, панель суперадмина, Fastify API, MySQL‑схема, вход по SMS, карты MapLibre, real‑time статусы и push‑уведомления.

## Быстрый запуск интерфейса

```bash
npm install
copy .env.example .env.local
npm start
```

В `.env.local` оставьте `EXPO_PUBLIC_DEMO_MODE=true`. На экране входа доступны три роли без базы: пассажир, водитель и админ.

## Полный локальный запуск

1. Создайте MySQL базу `taxi_grahovo`.
2. Скопируйте `.env.example` в `.env` и заполните server‑переменные.
3. Выполните:

```bash
npm run db:migrate
npm run db:seed
npm run dev
```

Web откроется по адресу Expo, API слушает `http://localhost:4100`.

В development `SMS_PROVIDER=console`: тестовый код подтверждения возвращается
интерфейсу без отправки SMS. Для production укажите `SMS_PROVIDER=notificore`,
секретный `NOTIFICORE_API_KEY` (или готовый `NOTIFICORE_BEARER_TOKEN`) и шаблон
`NOTIFICORE_TEMPLATE_ID=271`. При наличии зарегистрированного имени отправителя
задайте `NOTIFICORE_ORIGINATOR`. Для основного входа через MAX задайте `MAX_BOT_USERNAME`,
`MAX_BOT_TOKEN`, `MAX_WEBHOOK_SECRET` и подпишите webhook
`https://<ваш-домен>/v1/webhooks/max` на события `bot_started`,
`message_created` и `message_callback`.
Для входа через Telegram задайте `TELEGRAM_BOT_USERNAME`, `TELEGRAM_BOT_TOKEN`,
`TELEGRAM_WEBHOOK_SECRET`. Прокси и шлюз вебхуков настройте в панели супер администратора,
затем нажмите «Зарегистрировать вебхук». Настройки хранятся в MySQL и применяются
без перезапуска. Подробнее: [прокси и вебхуки](docs/GATEWAY.md).
Операционные уведомления для администраторов отправляются тем же ботом
в `TELEGRAM_ADMIN_CHAT_ID` (по умолчанию `-1004215180973`). Критические ошибки API,
серверного процесса и Expo-клиента отправляются в `TELEGRAM_CRITICAL_CHAT_ID`
(по умолчанию `-1004442605510`); Telegram-токен в клиентскую сборку не включается.
После входа через MAX или Telegram привязанный бот также отправляет пользователю
персональные транзакционные уведомления о поиске машины, этапах поездки, отменах и
результатах модерации. Из чата можно управлять уже созданным заказом; сам вызов такси
остаётся в приложении. При наличии обеих привязок сообщение доставляется в оба мессенджера.
Все секреты хранятся только на сервере и не должны иметь префикс `EXPO_PUBLIC_`.

Для входа через VK ID и уведомлений от сообщества задайте `VK_APP_ID`,
`VK_REDIRECT_URI`, `VK_COMMUNITY_ID`, `VK_BOT_TOKEN`, `VK_CALLBACK_SECRET` и
`VK_CALLBACK_CONFIRMATION`. Redirect VK ID:
`https://<api-домен>/v1/auth/vk/callback`; Callback API сообщества:
`https://<api-домен>/v1/webhooks/vk`. Полная настройка описана в
[`docs/VK_INTEGRATION.md`](docs/VK_INTEGRATION.md).

## Команды проверки

```bash
npm run typecheck
npm test
npm run lint
npm run build:web
npm run check
```

## Production через Docker

```bash
copy .env.production.example .env.production
powershell -ExecutionPolicy Bypass -File deploy/osrm/prepare.ps1
docker compose --env-file .env.production up -d --build
```

Скрипт один раз скачивает данные OpenStreetMap и готовит собственный
автомобильный маршрутизатор OSRM. Контейнер web слушает порт `8080`; перед ним
нужен HTTPS reverse proxy/CDN. MySQL и OSRM не публикуют порты наружу. Изменения
схемы находятся в `server/migrations`.

## Нативные сборки

Создайте EAS project, укажите `EAS_PROJECT_ID`, добавьте production environment variables и выполните:

```bash
npx eas-cli@latest build --profile preview
npx eas-cli@latest build --profile production
```

Production Android создаётся как AAB, iOS — как App Store build; номера увеличиваются EAS автоматически. Облачные сборки и аккаунты магазинов могут требовать оплаты.

Для APK RuStore с собственным каналом push создайте production-проект для
`ru.grahovo.taxi` и release SHA-256 в RuStore Консоли. В EAS production
environment задайте `RUSTORE_PUSH_ENABLED=true` и публичный
`RUSTORE_PUSH_PROJECT_ID`. На сервере задайте тот же project ID и секретный
`RUSTORE_PUSH_SERVICE_TOKEN`, затем собирайте профиль `rustore`. Сервисный токен
нельзя включать в приложение или хранить в Git.

## Карты, маршруты и адреса

Карту отображает MapLibre: нативный компонент на Android/iOS и GL JS в браузере.
Собственный светлый/тёмный стиль включает здания в 3D, улицы и точки населённых
пунктов. По умолчанию векторные тайлы и шрифты загружаются с OpenFreeMap без API-ключа.
Можно задать свои совместимые источники через `EXPO_PUBLIC_MAP_TILES_URL` и
`EXPO_PUBLIC_MAP_GLYPHS_URL`. Карта требует соединения с источником данных.

Расстояние и длительность поездки рассчитывает собственный OSRM по данным
OpenStreetMap. Поиск адресов использует локальный справочник Грахово и
кэшируемый Nominatim без автодополнения. Обратное геокодирование и уточнение улицы
также идут через API приложения. Кнопка «Маршрут» включает карту и возобновляет
слежение за машиной внутри приложения. Подробности:
[MapLibre](docs/MAPLIBRE.md), [маршрутизация и геокодирование](docs/OSM_ROUTING.md).
Справочник района дополнен координатами домов из OSM; импорт в MySQL и границы
покрытия описаны в [документации адресного каталога](docs/GRAHOVO_HOUSE_DIRECTORY.md).

## Документация

- [Архитектура](docs/ARCHITECTURE.md)
- [Чек‑лист запуска](docs/PRODUCTION_CHECKLIST.md)
- [Юридическая подготовка](docs/LEGAL_LAUNCH.md)
- [Маршрутизация и геокодирование](docs/OSM_ROUTING.md)
- [Описание для магазинов](store-listing/ru-RU.md)
- [Дизайн‑система](.superdesign/design-system.md)

Перед коммерческим запуском обязательно заполните внешние ключи, реквизиты оператора и пройдите чек‑лист. Код не может самостоятельно создать договоры перевозки или аккаунты Apple/Google/VK.
