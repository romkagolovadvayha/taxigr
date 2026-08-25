import type { FastifyInstance } from 'fastify';
import type { RowDataPacket } from 'mysql2/promise';

import type { RideOrder } from '../src/domain/models';
import {
  searchPriceIncreaseAvailableAt,
  searchPriceIncreaseOfferSlot,
} from '../src/domain/search-price-increase';
import { formatElapsedClock } from '../src/domain/elapsed-time';
import { formatMoney } from './admin-telegram';
import { db, firstRow } from './db';
import {
  notifyMessengerAccount,
  refreshMessengerAccountOrderMessages,
} from './messenger-notifications';
import { findUserWithRoles } from './repositories';
import {
  driverRideNotification,
  parseRideMessengerActionData,
  passengerRideNotification,
  rideMessengerActionData,
  type RideMessengerAction,
} from './ride-messenger';
import { signSession } from './security';

export type MessengerOrderActionRequest = {
  provider: 'max' | 'telegram' | 'vk';
  externalUserId: string;
  chatId?: string;
  sourceMessageId?: string;
  data: unknown;
};

export type MessengerOrderActionResult = {
  text: string;
  alert?: boolean;
};

type MessengerAccountUserRow = RowDataPacket & {
  user_id: string;
  chat_id: string;
};

type DriverIdentityRow = RowDataPacket & { id: string };

type ApiPayload<T> = {
  data?: T;
  error?: { message?: string; code?: string };
};

function secondsUntil(timestamp: number): string {
  const seconds = Math.max(0, Math.ceil((timestamp - Date.now()) / 1_000));
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${String(seconds % 60).padStart(2, '0')}`;
}

export function createMessengerOrderActionHandler(app: FastifyInstance) {
  return async (
    request: MessengerOrderActionRequest,
  ): Promise<MessengerOrderActionResult> => {
    const parsed = parseRideMessengerActionData(request.data);
    if (!parsed) return { text: 'Кнопка устарела или повреждена.', alert: true };

    const account = await firstRow<MessengerAccountUserRow>(
      `SELECT uma.user_id, uma.chat_id
       FROM user_messenger_accounts uma
       JOIN users u ON u.id = uma.user_id
       WHERE uma.provider = ? AND uma.external_user_id = ?
         AND uma.active = TRUE AND uma.bot_contact_available = TRUE
         AND u.deleted_at IS NULL AND u.blocked_at IS NULL
       LIMIT 1`,
      [request.provider, request.externalUserId],
    );
    if (
      !account ||
      ((request.provider === 'telegram' || request.provider === 'vk') &&
        request.chatId && account.chat_id !== request.chatId)
    ) {
      return {
        text: 'Сначала подтвердите этот аккаунт мессенджера в приложении.',
        alert: true,
      };
    }

    await db.execute(
      `UPDATE user_messenger_accounts SET last_seen_at = UTC_TIMESTAMP(3)
       WHERE provider = ? AND external_user_id = ?`,
      [request.provider, request.externalUserId],
    );

    const user = await findUserWithRoles(account.user_id);
    if (!user || user.blockedAt) return { text: 'Аккаунт недоступен.', alert: true };
    const driver = user.roles.includes('driver')
      ? await firstRow<DriverIdentityRow>('SELECT id FROM drivers WHERE user_id = ? LIMIT 1', [user.id])
      : null;
    const token = await signSession({ id: user.id, roles: user.roles });

    const call = async <T>(
      method: 'GET' | 'POST',
      url: string,
      payload?: Record<string, unknown>,
    ): Promise<{ ok: true; data: T } | { ok: false; message: string; code?: string }> => {
      const response = await app.inject({
        method,
        url,
        headers: { authorization: `Bearer ${token}` },
        ...(payload ? { payload } : {}),
      });
      const body = response.json<ApiPayload<T>>();
      return response.statusCode >= 200 && response.statusCode < 300 && body.data !== undefined
        ? { ok: true, data: body.data }
        : {
            ok: false,
            message: body.error?.message ?? 'Не удалось выполнить действие.',
            code: body.error?.code,
          };
    };

    if (parsed.action === 'accept') {
      if (!driver) return { text: 'Действие доступно только водителю.', alert: true };
      const accepted = await call<RideOrder>(
        'POST',
        `/v1/driver/orders/${parsed.orderId}/accept`,
      );
      if (accepted.ok) {
        await refreshMessengerAccountOrderMessages(
          request.provider,
          request.externalUserId,
          driverRideNotification(accepted.data),
          request.sourceMessageId,
        ).catch(() => undefined);
        return { text: 'Заказ принят ✅' };
      }
      await refreshMessengerAccountOrderMessages(
        request.provider,
        request.externalUserId,
        {
          orderId: parsed.orderId,
          audience: 'driver',
          icon: '🚕',
          title: 'Заказ уже недоступен',
          body: accepted.message,
          buttons: [],
        },
        request.sourceMessageId,
      ).catch(() => undefined);
      return { text: accepted.message, alert: true };
    }

    const orderResult = await call<RideOrder>('GET', `/v1/orders/${parsed.orderId}`);
    if (!orderResult.ok) return { text: orderResult.message, alert: true };
    const ride = orderResult.data;
    const audience = ride.passengerId === user.id
      ? 'passenger'
      : ride.driverId && ride.driverId === driver?.id
        ? 'driver'
        : null;
    if (!audience) return { text: 'Этот заказ вам недоступен.', alert: true };

    const refreshCurrentStatus = async (currentRide = ride): Promise<void> => {
      await refreshMessengerAccountOrderMessages(
        request.provider,
        request.externalUserId,
        audience === 'passenger'
          ? passengerRideNotification(currentRide)
          : driverRideNotification(currentRide),
        request.sourceMessageId,
      );
    };

    if (parsed.action === 'refresh') {
      await refreshCurrentStatus();
      return {
        text: ride.status === 'searching'
          ? `Поиск идёт ${formatElapsedClock(ride.createdAt)}`
          : 'Статус обновлён.',
      };
    }

    if (parsed.action === 'cancel') {
      if (audience !== 'passenger') return { text: 'Отменить заказ может пассажир.', alert: true };
      if (!['searching', 'accepted', 'driver_arriving', 'driver_waiting'].includes(ride.status)) {
        await refreshCurrentStatus().catch(() => undefined);
        return {
          text: ride.status === 'completed'
            ? 'Поездка уже завершена.'
            : 'Заказ уже нельзя отменить.',
          alert: true,
        };
      }
      await notifyMessengerAccount(request.provider, request.externalUserId, {
        orderId: ride.id,
        audience,
        syncExistingOrderMessages: false,
        icon: '⚠️',
        title: 'Отменить заказ?',
        body: 'После отмены поиск или поездка будут остановлены.',
        details: [['💳 Стоимость', formatMoney(ride.priceMinor)]],
        buttons: [
          [{
            type: 'callback',
            label: 'Да, отменить',
            data: rideMessengerActionData(ride.id, 'cancel-confirm'),
            intent: 'negative',
          }],
          [{
            type: 'callback',
            label: 'Не отменять',
            data: rideMessengerActionData(ride.id, 'refresh'),
          }],
        ],
      });
      return { text: 'Подтвердите отмену ниже.' };
    }

    if (parsed.action === 'increase') {
      if (audience !== 'passenger' || ride.status !== 'searching') {
        await refreshCurrentStatus().catch(() => undefined);
        return { text: 'Повышение цены сейчас недоступно.', alert: true };
      }
      const offerSlot = searchPriceIncreaseOfferSlot(ride);
      if (offerSlot == null) {
        const availableAt = searchPriceIncreaseAvailableAt(
          ride.createdAt,
          ride.searchPriceIncreaseLastSlot ?? 0,
          ride.searchPriceIncreaseIntervalMinutes,
        );
        return {
          text: availableAt
            ? `Следующее повышение будет доступно через ${secondsUntil(availableAt)}.`
            : 'Повышение цены пока недоступно.',
          alert: true,
        };
      }
      const increaseMinor = ride.searchPriceIncreaseStepMinor ?? 3_000;
      await notifyMessengerAccount(request.provider, request.externalUserId, {
        orderId: ride.id,
        audience,
        syncExistingOrderMessages: false,
        icon: '💰',
        title: `Повысить цену на ${formatMoney(increaseMinor)}?`,
        body: `Новая стоимость: ${formatMoney(ride.priceMinor + increaseMinor)}.`,
        buttons: [[{
          type: 'callback',
          label: `Подтвердить ${formatMoney(ride.priceMinor + increaseMinor)}`,
          data: rideMessengerActionData(ride.id, 'increase-confirm'),
          intent: 'positive',
        }]],
      });
      return { text: 'Подтвердите новую цену ниже.' };
    }

    if (parsed.action === 'complete') {
      if (audience !== 'driver' || ride.status !== 'in_progress') {
        await refreshCurrentStatus().catch(() => undefined);
        return { text: 'Завершить эту поездку сейчас нельзя.', alert: true };
      }
      await notifyMessengerAccount(request.provider, request.externalUserId, {
        orderId: ride.id,
        audience,
        syncExistingOrderMessages: false,
        icon: '🏁',
        title: 'Оплата получена?',
        body: 'Подтвердите, что пассажир доставлен в место назначения и оплата получена.',
        details: [['💳 Итого', formatMoney(ride.priceMinor)]],
        buttons: [
          [{
            type: 'callback',
            label: 'Оплата получена, завершить',
            data: rideMessengerActionData(ride.id, 'complete-confirm'),
            intent: 'positive',
          }],
          [{
            type: 'callback',
            label: 'Продолжить поездку',
            data: rideMessengerActionData(ride.id, 'refresh'),
          }],
        ],
      });
      return { text: 'Подтвердите завершение ниже.' };
    }

    const endpoint = (() => {
      switch (parsed.action) {
        case 'driver-arriving':
          return ['POST', `/v1/driver/orders/${ride.id}/transition`, { status: 'driver_arriving' }] as const;
        case 'driver-waiting':
          return ['POST', `/v1/driver/orders/${ride.id}/transition`, { status: 'driver_waiting' }] as const;
        case 'start-trip':
          return ['POST', `/v1/driver/orders/${ride.id}/transition`, { status: 'in_progress' }] as const;
        case 'complete-confirm':
          return [
            'POST',
            `/v1/driver/orders/${ride.id}/transition`,
            { status: 'completed', paymentReceived: true },
          ] as const;
        case 'waiting-start':
          return ['POST', `/v1/driver/orders/${ride.id}/waiting/start`] as const;
        case 'waiting-stop':
          return ['POST', `/v1/driver/orders/${ride.id}/waiting/stop`] as const;
        case 'cancel-confirm':
          return ['POST', `/v1/orders/${ride.id}/cancel`] as const;
        case 'increase-confirm':
          return ['POST', `/v1/orders/${ride.id}/search-price-increase`] as const;
        default: {
          const rating = parsed.action.match(/^rate-([1-5])$/u)?.[1];
          return rating
            ? ['POST', `/v1/orders/${ride.id}/rating`, { score: Number(rating) }] as const
            : null;
        }
      }
    })();
    if (!endpoint) return { text: 'Действие не поддерживается.', alert: true };

    const result = await call<RideOrder>(endpoint[0], endpoint[1], endpoint[2]);
    if (!result.ok) {
      await refreshCurrentStatus().catch(() => undefined);
      return { text: result.message, alert: true };
    }
    await refreshCurrentStatus(result.data).catch(() => undefined);
    const priceWasIncreased = result.data.priceMinor > ride.priceMinor;
    return {
      text: parsed.action.startsWith('rate-')
        ? 'Спасибо! Оценка сохранена ⭐'
        : ({
            accept: 'Заказ принят ✅',
            'driver-arriving': 'Пассажир видит, что вы выехали 🚗',
            'driver-waiting': 'Пассажир получил уведомление 📍',
            'start-trip': 'Поездка началась ▶️',
            'complete-confirm': 'Поездка завершена 🏁',
            'waiting-start': 'Ожидание включено ⏱',
            'waiting-stop': 'Ожидание остановлено ⏹',
            'cancel-confirm': 'Заказ отменён.',
            'increase-confirm': priceWasIncreased
              ? `Цена повышена до ${formatMoney(result.data.priceMinor)}.`
              : `Текущая цена — ${formatMoney(result.data.priceMinor)}.`,
          } as Partial<Record<RideMessengerAction, string>>)[parsed.action] ?? 'Готово.',
    };
  };
}
