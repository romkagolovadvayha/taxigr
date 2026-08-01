# Чек‑лист коммерческого запуска

## Обязательные внешние данные

- [ ] Зарегистрировать домен и заменить `PUBLIC_URL`, если он отличается от `taxigr.ru`.
- [ ] Внести телефон владельца в формате E.164 в `SUPERADMIN_PHONES` (несколько телефонов — через запятую).
- [ ] Подготовить граф OSRM командой `deploy/osrm/prepare.ps1` или `prepare.sh`.
- [ ] Проверить лицензионную атрибуцию OpenStreetMap и работу кэша Nominatim.
- [ ] Ограничить JavaScript‑ключ Яндекс Карт доменом, Android package `ru.grahovo.taxi` и iOS bundle `ru.grahovo.taxi`.
- [ ] Создать EAS project и заполнить `EAS_PROJECT_ID`; добавить production variables в EAS.
- [ ] Создать Apple Developer и Google Play Console приложения.
- [ ] Заполнить все `EXPO_PUBLIC_OPERATOR_*` и `EXPO_PUBLIC_TAXI_REGISTRY_NUMBER`; проверить реквизиты на `/legal`.
- [ ] Подтвердить включение службы заказа легкового такси в региональный реестр и соответствие модели работы 580‑ФЗ.
- [ ] Провести проверку юристом страниц `/terms`, `/passenger-rules`, `/privacy`, `/personal-data-consent`, `/driver-terms`, `/driver-data-consent` и `/safety` с учётом реальной модели договоров и оплаты.
- [ ] Проверить претензионный порядок, сроки хранения данных и процесс отзыва согласия; зарегистрировать обработку персональных данных, если это требуется для выбранной модели оператора.
- [ ] Подтвердить правовую модель агрегатора/перевозчика с профильным юристом и требования к водителям/страхованию.

## Инфраструктура

- [ ] Скопировать `.env.production.example` в `.env.production` и сгенерировать уникальные пароли.
- [ ] Закрыть MySQL от публичной сети.
- [ ] Разместить reverse proxy за TLS 1.2/1.3; включить HSTS после проверки домена.
- [ ] Настроить ежедневные зашифрованные backup MySQL и проверить восстановление.
- [ ] Настроить мониторинг `/health/live`, `/health/ready`, 5xx, задержки и свободное место.
- [ ] Настроить централизованные логи без JWT, OAuth‑кодов и персональных данных.
- [ ] Повторить `npm audit`; текущая умеренная advisory `uuid` находится в Expo/Xcode build toolchain, не в минимальном API runtime image. Не применять `--force`, пока Expo SDK не выпустит совместимое обновление.
- [ ] Отключить `EXPO_PUBLIC_DEMO_MODE` во всех production build.
- [ ] Проверить webhooks MAX и Telegram, включая секретные заголовки и передачу собственного номера.
- [ ] Создать DKIM/SPF для `support@...` или заменить адрес поддержки.

## Проверка выпуска

- [ ] `npm ci && npm run check`.
- [ ] `docker compose config` и тест миграции на пустой базе.
- [ ] Реальный SMS-вход на web/iOS/Android.
- [ ] Реальный маршрут в Грахово, в Можгу и обратный маршрут.
- [ ] Гонка принятия одного заказа двумя водителями.
- [ ] Все переходы статусов и push в фоне.
- [ ] Детский заказ доступен только водителю с креслом.
- [ ] Отмена, потеря сети, повторный запрос и восстановление после перезапуска.
- [ ] VoiceOver/TalkBack, крупный текст, телефон 360 px, планшет и desktop.
- [ ] TestFlight и Google Play Internal Testing перед production rollout.

Запуск в магазины выполняется только после этого списка. Команды:

```bash
npx eas-cli@latest build --profile production
npx eas-cli@latest submit -p ios --latest
npx eas-cli@latest submit -p android --latest
```
