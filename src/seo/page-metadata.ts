import { legalDocuments } from '../legal/documents';

export type PageMetadata = {
  title: string;
  description: string;
  indexable: boolean;
  canonicalPath?: string;
};

export const PAGE_METADATA = {
  '/': {
    title: 'Такси Грахово — заказать такси',
    description:
      'Закажите такси по Грахово, Граховскому району и в соседние города. Доступны тарифы «Эконом» и «Детский».',
    indexable: true,
    canonicalPath: '/',
  },
  '/legal': {
    title: 'Правовая информация — Такси Грахово',
    description:
      'Правила сервиса, условия поездок, политика персональных данных и информация о безопасности.',
    indexable: true,
    canonicalPath: '/legal',
  },
  '/terms': {
    title: `${legalDocuments.terms.title} — Такси Грахово`,
    description:
      'Условия использования Такси Грахово: оформление заказа, оплата, отмена поездки и ответственность сторон.',
    indexable: true,
    canonicalPath: legalDocuments.terms.path,
  },
  '/passenger-rules': {
    title: `${legalDocuments.passengerRules.title} — Такси Грахово`,
    description:
      'Простые правила заказа и поездки для пассажиров Такси Грахово.',
    indexable: true,
    canonicalPath: legalDocuments.passengerRules.path,
  },
  '/privacy': {
    title: `${legalDocuments.privacy.title} — Такси Грахово`,
    description:
      'Какие персональные данные обрабатывает Такси Грахово, зачем они нужны и как защищаются.',
    indexable: true,
    canonicalPath: legalDocuments.privacy.path,
  },
  '/account-deletion': {
    title: 'Удаление аккаунта — Такси Грахово',
    description:
      'Как запросить удаление аккаунта Такси Грахово, какие данные удаляются, что сохраняется и на какой срок.',
    indexable: true,
    canonicalPath: '/account-deletion',
  },
  '/personal-data-consent': {
    title: `${legalDocuments.personalDataConsent.title} — Такси Грахово`,
    description:
      'Согласие пользователя Такси Грахово на обработку персональных данных.',
    indexable: true,
    canonicalPath: legalDocuments.personalDataConsent.path,
  },
  '/driver-terms': {
    title: `${legalDocuments.driverTerms.title} — Такси Грахово`,
    description:
      'Условия подключения водителей, требования к автомобилю, порядок работы и комиссия сервиса.',
    indexable: true,
    canonicalPath: legalDocuments.driverTerms.path,
  },
  '/driver-data-consent': {
    title: `${legalDocuments.driverDataConsent.title} — Такси Грахово`,
    description:
      'Согласие кандидата в водители на обработку данных заявки, документов и автомобиля.',
    indexable: true,
    canonicalPath: legalDocuments.driverDataConsent.path,
  },
  '/safety': {
    title: `${legalDocuments.safety.title} — Такси Грахово`,
    description:
      'Правила безопасной поездки и порядок действий пассажира и водителя в экстренной ситуации.',
    indexable: true,
    canonicalPath: legalDocuments.safety.path,
  },
  '/sign-in': {
    title: 'Вход в приложение — Такси Грахово',
    description:
      'Войдите по номеру телефона, чтобы заказать такси или продолжить работу водителем.',
    indexable: false,
  },
  '/profile-setup': {
    title: 'Первичная настройка профиля — Такси Грахово',
    description:
      'Укажите имя, фамилию и пол после первого входа по телефону.',
    indexable: false,
  },
  '/address-search': {
    title: 'Поиск адреса — Такси Грахово',
    description:
      'Выберите точный адрес подачи автомобиля или место назначения.',
    indexable: false,
  },
  '/order-confirmation': {
    title: 'Подтверждение заказа — Такси Грахово',
    description:
      'Проверьте маршрут, тариф и стоимость перед заказом автомобиля.',
    indexable: false,
  },
  '/orders': {
    title: 'Мои поездки — Такси Грахово',
    description:
      'История заказов и информация о текущих и завершённых поездках.',
    indexable: false,
  },
  '/orders/[id]': {
    title: 'Информация о поездке — Такси Грахово',
    description:
      'Маршрут, стоимость, статус и данные водителя по выбранной поездке.',
    indexable: false,
  },
  '/profile': {
    title: 'Профиль пассажира — Такси Грахово',
    description:
      'Фотография, поездки, настройки аккаунта и переход к кабинету водителя.',
    indexable: false,
  },
  '/personal-data': {
    title: 'Личные данные пассажира — Такси Грахово',
    description:
      'Изменение имени, фамилии и пола в профиле пассажира Такси Грахово.',
    indexable: false,
  },
  '/settings': {
    title: 'Настройки приложения — Такси Грахово',
    description:
      'Настройте тему, уведомления, звук, вибрацию и передачу геопозиции водителю.',
    indexable: false,
  },
  '/driver-application': {
    title: 'Стать водителем — Такси Грахово',
    description:
      'Подайте заявку водителя и укажите данные автомобиля для проверки.',
    indexable: false,
  },
  '/driver': {
    title: 'Заказы водителя — Такси Грахово',
    description:
      'Выход на линию, новые предложения и управление текущей поездкой.',
    indexable: false,
  },
  '/driver/earnings': {
    title: 'Доход водителя — Такси Грахово',
    description:
      'Заработок, комиссия сервиса, сумма к выплате и статистика поездок.',
    indexable: false,
  },
  '/driver/trips': {
    title: 'Поездки водителя — Такси Грахово',
    description:
      'История выполненных и отменённых заказов водителя, выручка, комиссия сервиса и итоговая сумма.',
    indexable: false,
  },
  '/driver/trips/[id]': {
    title: 'Детали поездки водителя — Такси Грахово',
    description:
      'Маршрут, пассажир, стоимость, ожидание, комиссия и оценки по выбранной поездке водителя.',
    indexable: false,
  },
  '/driver/support': {
    title: 'Помощь водителю — Такси Грахово',
    description:
      'Контакты поддержки, экстренная служба, безопасность поездок, условия работы и обработка данных.',
    indexable: false,
  },
  '/driver/profile': {
    title: 'Автомобиль и профиль — Такси Грахово',
    description:
      'Данные водителя, автомобиль, детское кресло и заявки на изменение.',
    indexable: false,
  },
  '/admin': {
    title: 'Панель управления — Такси Грахово',
    description:
      'Сводка по заказам, водителям, заявкам и работе сервиса.',
    indexable: false,
  },
  '/admin/applications': {
    title: 'Заявки водителей — Панель Такси Грахово',
    description:
      'Проверка и принятие заявок водителей и изменений автомобиля.',
    indexable: false,
  },
  '/admin/drivers': {
    title: 'Водители — Панель Такси Грахово',
    description:
      'Управление водителями, доступом к заказам и личной комиссией.',
    indexable: false,
  },
  '/admin/orders': {
    title: 'Заказы — Панель Такси Грахово',
    description:
      'Просмотр активных и завершённых заказов и их текущих статусов.',
    indexable: false,
  },
  '/admin/settings': {
    title: 'Тарифы и комиссия — Панель Такси Грахово',
    description:
      'Настройка тарифов, стоимости поездок и комиссии сервиса.',
    indexable: false,
  },
  '/+not-found': {
    title: 'Страница не найдена — Такси Грахово',
    description:
      'Запрошенная страница не найдена. Вернитесь на главную страницу Такси Грахово.',
    indexable: false,
  },
  '/_sitemap': {
    title: 'Карта приложения — Такси Грахово',
    description:
      'Служебная карта маршрутов веб-приложения Такси Грахово.',
    indexable: false,
  },
} satisfies Record<string, PageMetadata>;

export const FALLBACK_PAGE_METADATA: PageMetadata = {
  title: 'Такси Грахово',
  description:
    'Местное такси для поездок по Грахово, Граховскому району и соседним городам.',
  indexable: false,
};

export function getPageMetadata(pathname: string): PageMetadata {
  if (/^\/orders\/[^/]+$/.test(pathname)) return PAGE_METADATA['/orders/[id]'];
  if (/^\/driver\/trips\/[^/]+$/.test(pathname)) return PAGE_METADATA['/driver/trips/[id]'];
  return PAGE_METADATA[pathname as keyof typeof PAGE_METADATA] ?? FALLBACK_PAGE_METADATA;
}
