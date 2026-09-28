# Деплой из Gitlub

Основной репозиторий: https://gitlub.prostoj.store/romkagolovadvayha/taxigr.
Push в `main` запускает `.forgejo/workflows/deploy.yml`. Ручной запуск доступен в Actions.

На сервере сборок 147.45.235.170 под пользователем `gitlub-ci` выполняются
`npm ci`, тесты упаковки, `npm run check` (TypeScript, Vitest, ESLint, Expo web).
Системный регрессионный тест отдельно проверяет временные службы systemd.
Node 24.19.0 установлен в `/opt/gitlub-ci`; сборка ограничена 4 ГБ памяти и 150% CPU.
Она использует отдельную рабочую папку и не получает секреты production.

После проверок архив с SHA-256 передаётся на 212.193.26.91. Существующий
`deploy/remote-deploy.sh` устанавливает серверные зависимости, выполняет миграции,
переключает `/var/www/taxigr/current` и проверяет готовность API с прежним механизмом
отката. Рабочий сервер не клонирует репозиторий: он получает готовый релиз.
Затем проверяются вход для модерации, сайт, карта, API, VK и MAX.

GitHub Environment `production` перенесён в Settings → Actions → Variables/Secrets
с префиксом `PRODUCTION_`. Полный исходный `/etc/taxigr/taxigr.env` хранится в секрете
`PRODUCTION_DEPLOY_ENV`; одноимённые отдельные переменные и секреты переопределяют
соответствующие значения. Это сохраняет дополнительные настройки, отсутствовавшие
в GitHub. После смены MYSQL_PASSWORD пересобирается MYSQL_URL.
`PRODUCTION_YANDEX_MAPS_API_KEY` сохранён как прежний параметр; карта использует MapLibre.

`BUILD_SSH_HOST`, `BUILD_SSH_PRIVATE_KEY`, `BUILD_SSH_KNOWN_HOSTS` соединяют runner
с сервером сборок. Новый `PRODUCTION_SSH_PRIVATE_KEY_B64` — резервная копия ключа
между сервером сборок и production; активная копия установлена только у root
на сервере сборок. Ключи ограничены адресом отправителя и командой деплоя, ключи
хостов закреплены заранее. Изменение целевых адресов требует обновить серверные
обработчики `/usr/local/sbin/gitlub-taxigr-build` и `gitlub-taxigr-production`.

Старый GitHub workflow отключён после успешного деплоя через Gitlub. Локальные
изменения приложения и процессы публикации Android/iOS этим переносом не затронуты.
