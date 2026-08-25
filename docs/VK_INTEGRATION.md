# VK ID и бот сообщества

Интеграция состоит из двух связанных частей:

1. VK ID подтверждает личность и передаёт номер телефона по OAuth 2.1 + PKCE.
2. Бот сообщества `https://vk.ru/taxigr` отправляет статусы поездок и обрабатывает кнопки действий.

## Приложение VK ID

Создайте приложение «Такси Грахово» в кабинете VK ID и укажите:

- платформа: Web;
- доверенный домен: `taxigr.ru`;
- redirect URI: `https://api.taxigr.ru/v1/auth/vk/callback`;
- запрашиваемое право: `phone`;
- логотип: `assets/brand/icon.png`;
- политика конфиденциальности: `https://taxigr.ru/privacy`;
- пользовательское соглашение: `https://taxigr.ru/terms`.

Полученный идентификатор приложения сохраните в `VK_APP_ID`.

## Бот сообщества

В управлении сообществом `taxigr`:

1. Включите сообщения сообщества.
2. В разделе «Работа с API» создайте ключ сообщества с правом доступа к сообщениям и сохраните его в `VK_BOT_TOKEN`.
3. В Callback API добавьте сервер `https://api.taxigr.ru/v1/webhooks/vk`.
4. Укажите случайную секретную строку — то же значение сохраните в `VK_CALLBACK_SECRET`.
5. Скопируйте строку подтверждения сервера в `VK_CALLBACK_CONFIRMATION`.
6. Сохраните числовой ID сообщества в `VK_COMMUNITY_ID`.
7. В типах событий включите «Входящее сообщение» и «Событие действия с сообщением» (`message_new`, `message_event`).
8. Используйте версию API `5.199`.

## Переменные окружения

```dotenv
VK_APP_ID=
VK_REDIRECT_URI=https://api.taxigr.ru/v1/auth/vk/callback
VK_COMMUNITY_ID=
VK_BOT_TOKEN=
VK_CALLBACK_SECRET=
VK_CALLBACK_CONFIRMATION=
VK_API_VERSION=5.199
```

## Production Callback API

Production endpoint: `https://api.taxigr.ru/v1/webhooks/vk`.

В GitHub Environment `production` должны быть заданы переменные:

- `VK_APP_ID` — ID приложения VK ID;
- `VK_COMMUNITY_ID` — числовой ID сообщества;
- `VK_API_VERSION` — `5.199`.

И секреты:

- `VK_BOT_TOKEN`;
- `VK_CALLBACK_SECRET`;
- `VK_CALLBACK_CONFIRMATION`.

Deployment workflow передаёт их серверу и после выкладки отправляет контрольный
запрос `confirmation`. Деплой завершается ошибкой, если endpoint не вернул точную
строку из `VK_CALLBACK_CONFIRMATION`.

Для создания или обновления сервера и включения событий `message_new` и
`message_event` добавьте административный пользовательский токен только локально в
`.env.local` как `VK_USER_TOKEN`, затем выполните:

```bash
npm run vk:callback:configure
```

Пользовательский токен не нужен production-серверу и не должен добавляться в
GitHub Secrets или попадать в репозиторий.

После заполнения переменных выполните миграции и перезапустите API:

```sh
npm run db:migrate
npm run server:start
```

## Проверка

1. На экране входа укажите номер, примите документы и нажмите «Продолжить с VK ID».
2. Разрешите передачу номера. Он должен совпасть с номером, введённым в приложении.
3. После успешного входа откройте `https://vk.ru/taxigr` и отправьте любое сообщение.
4. Бот подтвердит подключение. После этого в VK будут приходить статусы заказов и кнопки действий.

Секреты и токены нельзя добавлять в клиентские переменные `EXPO_PUBLIC_*` или коммитить в репозиторий.
