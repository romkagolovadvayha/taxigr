# Покрытие функционала в концепции «Тихое движение»

> Обновление: согласованный дизайн внедрён в рабочее приложение. Результаты — в [отчёте о внедрении](implementation-report-2026-09-09.md). Ниже сохранено описание предыдущего этапа HTML-прототипа.


9 сентября 2026.

Ранее макет содержал четыре обзорные поверхности и несколько простых диалогов. Замечание о неполном функционале было обоснованным. Теперь в прототипе 52 экрана и состояния; визуально представлены все 34 экранных модуля из `src/screens`.

Это покрытие интерфейса и локальных демонстрационных сценариев. Рабочее Expo-приложение и API не изменены. Полная функциональная эквивалентность нативной и веб-версии не заявляется.

## Что теперь можно пройти целиком

- Пассажир: адрес и уточнение дома, до пяти точек, изменение порядка, тариф, наличные/перевод, комментарий, первое согласие, поиск и повышение цены, назначение, очередь, ожидание, отмена, завершение и оценка.
- Профиль: личные данные, локальное фото, история и детали, настройки темы/уведомлений/геопозиции, заявка водителя, правовые документы, черновик запроса удаления.
- Водитель: линия и ошибки геолокации, предложение, прибытие, поездка, остановки, бесплатное/платное ожидание, подтверждение оплаты, оценка пассажира, следующий заказ, отказ с причиной, история, расчёты и изменение машины на проверку.
- Администратор: сводка, заказы и отмена с причиной, профили, блокировка/разблокировка, снятие ограничения заказов, комиссия и приоритеты, удаление оценки с подтверждением, модерация заявки и машины, справочник мест и настройки сервиса.
- Общие состояния: вход через мессенджеры и SMS, проверка демокода, VK Mini App, ошибки и пустые состояния.

## Связи данных

Заявка пассажира появляется в модерации; новая машина остаётся неактивной до одобрения; активные места доступны в поиске адреса; переписка доступна администратору только для чтения; блокировка пассажира отражается в его экранах; следующая поездка водителя становится текущей после завершения. Изменения хранятся в памяти страницы до перезагрузки.

## Границы прототипа

| Возможность | Что показано | Что остаётся в рабочем приложении / на этапе внедрения |
| --- | --- | --- |
| Карта, геокодирование, GPS, навигация | Схема, ручной адрес и выбор демонстрационной точки | Реальные карты, поиск по России, координаты, построение маршрутов, навигатор |
| Вход, SMS, VK, MAX, Telegram | Формы, согласия, ожидание, успешный и ошибочный исход | Настоящие провайдеры, коды, VK Bridge, сессии и подтверждение номера |
| Поездки и серверная синхронизация | Локальные состояния и переходы | Диспетчеризация, конкуренция за заказ, фоновые обновления, восстановление связи |
| Тариф и ожидание | Демоарифметика по Грахово, шаг повышения, минуты ожидания переключаются вручную | Реальная зона, время, расстояние, серверный расчёт и таймеры |
| Остановки | Добавление, удаление, порядок стрелками | Нативный жест перетаскивания |
| Фото | Выбор файла и локальное превью | Загрузка на сервер, обработка и синхронизация |
| Уведомления, звук, вибрация | Настройки и визуальное подтверждение | Разрешения ОС, push, устройства и каналы доставки |
| Администрирование | Формы, локальное сохранение и связанные примеры | Роли и права сервера, аудит, реальные секреты, webhook/proxy, пагинация API |
| Правовые документы | Полный текущий текст из исходников без переменных окружения | Реальные реквизиты оператора и фиксация согласий сервером |
| Поддержка / удаление | Сформированный черновик | Пользовательская отправка, проверка и обработка обращения |

## Сопоставление экранных модулей

| Роль | Исходный модуль | Экран в прототипе |
| --- | --- | --- |
| Общие разделы | `src/screens/account-deletion-screen.tsx` | [Удаление аккаунта и данных](quiet-motion-concept.html?screen=deletion) |
| Администратор | `src/screens/admin/admin-account-detail-screen.tsx` | [Карточка пользователя](quiet-motion-concept.html?screen=account) |
| Администратор | `src/screens/admin/admin-dashboard-screen.tsx` | [Операционная сводка](quiet-motion-concept.html?screen=dashboard) |
| Администратор | `src/screens/admin/admin-order-detail-screen.tsx` | [Детали заказа](quiet-motion-concept.html?screen=admin-order) |
| Администратор | `src/screens/admin/admin-orders-screen.tsx` | [Все заказы](quiet-motion-concept.html?screen=admin-orders) |
| Администратор | `src/screens/admin/admin-settings-screen.tsx` | [Настройки сервиса](quiet-motion-concept.html?screen=admin-settings) |
| Администратор | `src/screens/admin/applications-screen.tsx` | [Модерация заявок](quiet-motion-concept.html?screen=applications) |
| Администратор | `src/screens/admin/drivers-screen.tsx` | [Водители](quiet-motion-concept.html?screen=drivers) |
| Администратор | `src/screens/admin/passengers-screen.tsx` | [Пассажиры](quiet-motion-concept.html?screen=passengers) |
| Администратор | `src/screens/admin/places-screen.tsx` | [Справочник мест](quiet-motion-concept.html?screen=places) |
| Общие разделы | `src/screens/blocked-account-screen.tsx` | [Доступ ограничен](quiet-motion-concept.html?screen=blocked) |
| Водитель | `src/screens/driver/driver-home-screen.tsx` | [Смена и заказы](quiet-motion-concept.html?screen=driver) |
| Водитель | `src/screens/driver/driver-profile-screen.tsx` | [Профиль водителя](quiet-motion-concept.html?screen=driver-profile) |
| Водитель | `src/screens/driver/driver-support-screen.tsx` | [Помощь водителю](quiet-motion-concept.html?screen=support) |
| Водитель | `src/screens/driver/driver-trip-detail-screen.tsx` | [Расчёт поездки водителя](quiet-motion-concept.html?screen=driver-trip) |
| Водитель | `src/screens/driver/driver-trips-screen.tsx` | [История поездок водителя](quiet-motion-concept.html?screen=driver-trips) |
| Водитель | `src/screens/driver/earnings-screen.tsx` | [Расчёты с сервисом](quiet-motion-concept.html?screen=earnings) |
| Общие разделы | `src/screens/legal-hub-screen.tsx` | [Правовая информация](quiet-motion-concept.html?screen=legal) |
| Общие разделы | `src/screens/legal-screen.tsx` | [Документы сервиса](quiet-motion-concept.html?screen=legal-document) |
| Пассажир | `src/screens/passenger/address-search-screen.tsx` | [Адрес или место](quiet-motion-concept.html?screen=address) |
| Пассажир | `src/screens/passenger/driver-application-screen.tsx` | [Стать водителем](quiet-motion-concept.html?screen=application) |
| Пассажир | `src/screens/passenger/order-confirmation-screen.tsx` | [Проверим поездку](quiet-motion-concept.html?screen=confirmation) |
| Пассажир | `src/screens/passenger/order-detail-screen.tsx` | [Детали поездки](quiet-motion-concept.html?screen=order-detail) |
| Пассажир | `src/screens/passenger/order-screen.tsx` | [Заказ поездки](quiet-motion-concept.html?screen=order) |
| Пассажир | `src/screens/passenger/orders-screen.tsx` | [Ваши поездки](quiet-motion-concept.html?screen=history) |
| Пассажир | `src/screens/passenger/personal-data-screen.tsx` | [Личные данные](quiet-motion-concept.html?screen=personal) |
| Пассажир | `src/screens/passenger/profile-screen.tsx` | [Ваш профиль](quiet-motion-concept.html?screen=profile) |
| Пассажир | `src/screens/passenger/profile-setup-screen.tsx` | [Как к вам обращаться?](quiet-motion-concept.html?screen=setup) |
| Пассажир | `src/screens/passenger/settings-screen.tsx` | [Настройки](quiet-motion-concept.html?screen=settings) |
| Общие разделы | `src/screens/passenger/sign-in-screen.tsx` | [Вход по телефону](quiet-motion-concept.html?screen=sign-in) |
| Пассажир | `src/screens/passenger/stops-screen.tsx` | [Маршрут и остановки](quiet-motion-concept.html?screen=stops) |
| Общие разделы | `src/screens/public-landing-screen.tsx` | [Такси рядом](quiet-motion-concept.html?screen=landing) |
| Пассажир | `src/screens/ride/ride-chat-screen.tsx` | [Чат поездки](quiet-motion-concept.html?screen=chat) |
| Общие разделы | `src/screens/vk-mini-app-screen.tsx` | [Вход через VK Mini App](quiet-motion-concept.html?screen=vk) |

## Проверка

Сквозные сценарии и результаты обхода экранов: `full-flow-verification.json`. Все 52 экрана проверены в светлой и тёмной теме на ширинах 360, 768 и 1440 px; горизонтального переполнения диалогов, неизвестных действий и ошибок JavaScript не обнаружено. Отдельно пройдены 13 групп сквозных проверок. Нативная производительность и серверные интеграции этой проверкой не покрываются.
