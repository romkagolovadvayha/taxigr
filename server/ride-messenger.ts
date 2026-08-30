import type { RideOrder } from '../src/domain/models';
import { formatElapsedClock } from '../src/domain/elapsed-time';
import { formatMultiStopRouteLabel } from '../src/domain/route-label';
import { formatMoney } from './admin-telegram';
import {
  appUrl,
  type MessengerButton,
  type MessengerLocation,
  type PersonalMessengerNotification,
} from './messenger-notifications';

export type RideMessengerAction =
  | 'accept'
  | 'driver-arriving'
  | 'driver-waiting'
  | 'start-trip'
  | 'complete'
  | 'complete-confirm'
  | 'waiting-start'
  | 'waiting-stop'
  | 'cancel'
  | 'cancel-confirm'
  | 'increase'
  | 'increase-confirm'
  | 'refresh'
  | `rate-${1 | 2 | 3 | 4 | 5}`;

const actionCodes: Record<RideMessengerAction, string> = {
  accept: 'a',
  'driver-arriving': 'go',
  'driver-waiting': 'here',
  'start-trip': 'start',
  complete: 'done',
  'complete-confirm': 'done-ok',
  'waiting-start': 'wait-on',
  'waiting-stop': 'wait-off',
  cancel: 'cancel',
  'cancel-confirm': 'cancel-ok',
  increase: 'raise',
  'increase-confirm': 'raise-ok',
  refresh: 'refresh',
  'rate-1': 'rate-1',
  'rate-2': 'rate-2',
  'rate-3': 'rate-3',
  'rate-4': 'rate-4',
  'rate-5': 'rate-5',
};

const actionsByCode = new Map(
  Object.entries(actionCodes).map(([action, code]) => [code, action as RideMessengerAction]),
);

export function rideMessengerActionData(orderId: string, action: RideMessengerAction): string {
  return `r:${actionCodes[action]}:${orderId}`;
}

export function parseRideMessengerActionData(
  value: unknown,
): { orderId: string; action: RideMessengerAction } | null {
  if (typeof value !== 'string') return null;
  const match = value.match(
    /^r:([a-z0-9-]+):([0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})$/iu,
  );
  const action = match?.[1] ? actionsByCode.get(match[1]) : undefined;
  return match?.[2] && action ? { orderId: match[2], action } : null;
}

function callback(
  ride: RideOrder,
  action: RideMessengerAction,
  label: string,
  intent: MessengerButton['intent'] = 'default',
): MessengerButton {
  return {
    type: 'callback',
    label,
    data: rideMessengerActionData(ride.id, action),
    intent,
  };
}

function link(label: string, url: string): MessengerButton {
  return { type: 'link', label, url };
}

export function passengerRideButtons(ride: RideOrder): MessengerButton[][] {
  const openOrder = [link('📱 Открыть заказ', appUrl(`/orders/${ride.id}`))];
  if (ride.status === 'searching') {
    return [
      [
        callback(ride, 'increase', `💰 +${formatMoney(ride.searchPriceIncreaseStepMinor ?? 3_000)}`, 'positive'),
        callback(ride, 'refresh', '🔄 Обновить'),
      ],
      [callback(ride, 'cancel', '✖️ Отменить заказ', 'negative')],
      openOrder,
    ];
  }
  if (['accepted', 'driver_arriving', 'driver_waiting'].includes(ride.status)) {
    return [
      [callback(ride, 'refresh', '🔄 Обновить')],
      [callback(ride, 'cancel', '✖️ Отменить заказ', 'negative')],
      openOrder,
    ];
  }
  if (ride.status === 'in_progress') {
    return [[callback(ride, 'refresh', '🔄 Обновить')], openOrder];
  }
  if (ride.status === 'completed') {
    const rating = ride.ratings?.byPassenger
      ? []
      : [[1, 2, 3, 4, 5].map((score) =>
          callback(ride, `rate-${score as 1 | 2 | 3 | 4 | 5}`, `${score}⭐`),
        )];
    return [
      ...rating,
      [link(
        ride.ratings?.byPassenger ? '🏁 Поездка завершена' : '📋 Мои заказы',
        appUrl('/orders'),
      )],
    ];
  }
  if (ride.status === 'cancelled') {
    return [[link('❌ Заказ отменён', appUrl('/orders'))]];
  }
  return [[link('📋 Мои заказы', appUrl('/orders'))]];
}

export function driverRideButtons(ride: RideOrder): MessengerButton[][] {
  if (ride.status === 'searching') {
    return [
      [callback(ride, 'accept', '✅ Принять заказ', 'positive')],
      [link('📱 Открыть заказы', appUrl('/driver'))],
    ];
  }
  if (ride.driverQueuePosition === 2) {
    return [
      [callback(ride, 'refresh', '🔄 Обновить')],
      [link('📱 Открыть следующий заказ', appUrl('/driver'))],
    ];
  }
  const nextActions: Partial<Record<RideOrder['status'], [RideMessengerAction, string]>> = {
    accepted: ['driver-arriving', '🚗 Выехал к пассажиру'],
    driver_arriving: ['driver-waiting', '📍 Я на месте'],
    driver_waiting: ['start-trip', '▶️ Начать поездку'],
  };
  const nextAction = nextActions[ride.status];
  if (nextAction) {
    return [
      [callback(ride, nextAction[0], nextAction[1], 'positive')],
      [callback(ride, 'refresh', '🔄 Обновить')],
      [link('📱 Открыть поездку', appUrl('/driver'))],
    ];
  }
  if (ride.status === 'in_progress') {
    return [
      [
        ride.waitingStartedAt
          ? callback(ride, 'waiting-stop', '⏹ Остановить ожидание', 'negative')
          : callback(ride, 'waiting-start', '⏱ Включить ожидание'),
      ],
      [callback(ride, 'complete', '🏁 Завершить поездку', 'positive')],
      [callback(ride, 'refresh', '🔄 Обновить')],
    ];
  }
  if (ride.status === 'completed') {
    const rating = ride.ratings?.byDriver
      ? []
      : [[1, 2, 3, 4, 5].map((score) =>
          callback(ride, `rate-${score as 1 | 2 | 3 | 4 | 5}`, `${score}⭐`),
        )];
    return [
      ...rating,
      [link(
        ride.ratings?.byDriver ? '🏁 Поездка завершена' : '📋 Мои поездки',
        appUrl('/driver/trips'),
      )],
    ];
  }
  if (ride.status === 'cancelled') {
    return [[link('❌ Заказ отменён', appUrl('/driver/trips'))]];
  }
  return [[link('🚕 Искать заказы', appUrl('/driver'))]];
}

function vehicle(ride: RideOrder): string | null {
  return ride.driver
    ? `${ride.driver.vehicle.color} ${ride.driver.vehicle.make} · ${ride.driver.vehicle.plate}`
    : null;
}

function driverLocation(ride: RideOrder): MessengerLocation[] {
  if (ride.driverQueuePosition === 2) return [];
  const coordinates = ride.driver?.coordinates;
  return coordinates
    ? [{
        title: 'Водитель сейчас',
        address: vehicle(ride) ?? 'Машина на карте',
        latitude: coordinates.latitude,
        longitude: coordinates.longitude,
      }]
    : [];
}

function driverTargetLocation(ride: RideOrder): MessengerLocation[] {
  if (ride.driverQueuePosition === 2) return [];
  if (['searching', 'accepted', 'driver_arriving'].includes(ride.status)) {
    return [{
      title: 'Место подачи',
      address: ride.pickup.label,
      latitude: ride.pickup.coordinates.latitude,
      longitude: ride.pickup.coordinates.longitude,
    }];
  }
  if (['driver_waiting', 'in_progress'].includes(ride.status)) {
    return [{
      title: 'Место назначения',
      address: ride.destination.label,
      latitude: ride.destination.coordinates.latitude,
      longitude: ride.destination.coordinates.longitude,
    }];
  }
  return [];
}

const passengerTitles: Record<RideOrder['status'], [string, string]> = {
  draft: ['📝', 'Заказ не отправлен'],
  searching: ['🔎', 'Ищем водителя'],
  accepted: ['✅', 'Машина найдена'],
  driver_arriving: ['🚗', 'Водитель едет к вам'],
  driver_waiting: ['📍', 'Машина приехала'],
  in_progress: ['▶️', 'Поездка началась'],
  completed: ['🏁', 'Поездка завершена'],
  cancelled: ['❌', 'Заказ отменён'],
};

export function passengerRideNotification(
  ride: RideOrder,
  overrides: Partial<Pick<PersonalMessengerNotification, 'icon' | 'title' | 'body' | 'details'>> = {},
): PersonalMessengerNotification {
  const [baseIcon, baseTitle] = passengerTitles[ride.status];
  const queued = ride.driverQueuePosition === 2;
  const icon = queued ? '🕓' : baseIcon;
  const title = queued
    ? 'Водитель завершает предыдущий заказ'
    : ride.status === 'searching'
    ? `${baseTitle} · ${formatElapsedClock(ride.createdAt)}`
    : baseTitle;
  const activeDriver = ride.driverId && ride.driver;
  const details: PersonalMessengerNotification['details'] = [
    ['👤 Водитель', activeDriver ? ride.driver?.name : null],
    ['📞 Телефон', activeDriver ? ride.driver?.phone : null],
    ['🚘 Машина', activeDriver ? vehicle(ride) : null],
    [ride.status === 'completed' ? '💳 Итого' : '💳 Цена', formatMoney(ride.priceMinor)],
    ['⏱ Ожидание', ride.waitingPriceMinor ? formatMoney(ride.waitingPriceMinor) : null],
  ];
  return {
    orderId: ride.id,
    audience: 'passenger',
    icon: overrides.icon ?? icon,
    title: overrides.title ?? title,
    body: overrides.body ?? (queued
      ? 'Ваш заказ следующий. Сообщим, когда водитель освободится.'
      : formatMultiStopRouteLabel(ride.pickup, ride.destinations ?? [ride.destination])),
    details: overrides.details ? [...details, ...overrides.details] : details,
    buttons: passengerRideButtons(ride),
    locations: activeDriver && !queued && !['completed', 'cancelled'].includes(ride.status)
      ? driverLocation(ride)
      : [],
  };
}

const driverTitles: Record<RideOrder['status'], [string, string]> = {
  draft: ['📝', 'Заказ не отправлен'],
  searching: ['🚕', 'Новый заказ'],
  accepted: ['✅', 'Заказ принят'],
  driver_arriving: ['🚗', 'Едем к пассажиру'],
  driver_waiting: ['📍', 'Ожидаем пассажира'],
  in_progress: ['▶️', 'Поездка выполняется'],
  completed: ['🏁', 'Заказ завершён'],
  cancelled: ['❌', 'Заказ отменён'],
};

export function driverRideNotification(
  ride: RideOrder,
  overrides: Partial<Pick<PersonalMessengerNotification, 'icon' | 'title' | 'body' | 'details'>> = {},
): PersonalMessengerNotification {
  const [baseIcon, baseTitle] = driverTitles[ride.status];
  const queued = ride.driverQueuePosition === 2;
  const icon = queued ? '🕓' : baseIcon;
  const title = queued
    ? 'Следующий заказ принят'
    : ride.status === 'searching'
    ? `${baseTitle} · поиск ${formatElapsedClock(ride.createdAt)}`
    : baseTitle;
  const assigned = Boolean(ride.driverId);
  const details: PersonalMessengerNotification['details'] = [
    ['👤 Пассажир', assigned ? ride.passenger?.name : null],
    ['📞 Телефон', assigned ? ride.passenger?.phone : null],
    ['💳 Стоимость', formatMoney(ride.priceMinor)],
    ['🧾 Комиссия', ride.status === 'completed'
      ? formatMoney(ride.serviceCommissionMinor)
      : null],
    ['💵 Доход', ride.status === 'completed'
      ? formatMoney(ride.priceMinor - ride.serviceCommissionMinor)
      : null],
    ['💬 Комментарий', ride.comment],
  ];
  return {
    orderId: ride.id,
    audience: 'driver',
    icon: overrides.icon ?? icon,
    title: overrides.title ?? title,
    body: overrides.body ?? (queued
      ? `После текущей поездки · ${formatMultiStopRouteLabel(ride.pickup, ride.destinations ?? [ride.destination])}`
      : formatMultiStopRouteLabel(ride.pickup, ride.destinations ?? [ride.destination])),
    details: overrides.details ? [...details, ...overrides.details] : details,
    buttons: driverRideButtons(ride),
    locations: driverTargetLocation(ride),
  };
}
