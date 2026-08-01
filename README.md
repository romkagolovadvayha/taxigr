# Такси Грахово

Единое приложение локального такси для web, iOS и Android. В репозитории находятся пассажирский интерфейс, кабинет водителя, панель суперадмина, Fastify API, MySQL‑схема, вход по SMS, Яндекс Карты, real‑time статусы и push‑уведомления.

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
`https://<ваш-домен>/v1/webhooks/max` на события `bot_started` и `message_created`.
Для входа через Telegram задайте `TELEGRAM_BOT_USERNAME`, `TELEGRAM_BOT_TOKEN`,
`TELEGRAM_WEBHOOK_SECRET` и установите webhook Bot API на
`https://<ваш-домен>/v1/webhooks/telegram` с `allowed_updates=["message"]` и тем же
`secret_token`.
Все секреты хранятся только на сервере и не должны иметь префикс `EXPO_PUBLIC_`.

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

## Карты, маршруты и адреса

Предоставленный JavaScript API key Яндекса используется только для отображения
карты. Его нужно ограничить разрешённым доменом и идентификаторами приложений.

Расстояние и длительность поездки рассчитывает собственный OSRM по данным
OpenStreetMap. Поиск адресов использует локальный справочник Грахово и
кэшируемый Nominatim без автодополнения. Платные ключи Яндекс Router и
Geocoder не требуются. Подробности: [маршрутизация и геокодирование](docs/OSM_ROUTING.md).

## Документация

- [Архитектура](docs/ARCHITECTURE.md)
- [Чек‑лист запуска](docs/PRODUCTION_CHECKLIST.md)
- [Юридическая подготовка](docs/LEGAL_LAUNCH.md)
- [Маршрутизация и геокодирование](docs/OSM_ROUTING.md)
- [Описание для магазинов](store-listing/ru-RU.md)
- [Дизайн‑система](.superdesign/design-system.md)

Перед коммерческим запуском обязательно заполните внешние ключи, реквизиты оператора и пройдите чек‑лист. Код не может самостоятельно создать договоры перевозки, аккаунты Apple/Google/VK или коммерческие лицензии Яндекс API.
