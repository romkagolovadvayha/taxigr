import type { RideOrder } from '../src/domain/models';
import type { PushMessage } from './push';
import { completionSound } from '../src/feedback/ride-feedback';

function vehiclePlate(ride: RideOrder): string | null {
  const plate = ride.driver?.vehicle.plate.trim();
  return plate || null;
}

function carStatus(ride: RideOrder, action: string): string {
  const plate = vehiclePlate(ride);
  return plate ? `Номер авто ${plate} ${action}` : `Автомобиль ${action}`;
}

export function passengerRidePush(ride: RideOrder): PushMessage | null {
  const common = { data: { orderId: ride.id } };
  switch (ride.status) {
    case 'accepted':
      if (ride.driverQueuePosition === 2) {
        return {
          ...common,
          title: 'Водитель принял заказ заранее',
          body: 'Сейчас водитель завершает предыдущую поездку. Сообщим, когда он освободится.',
          sound: 'taxi_found_queued.wav',
          channelId: 'ride-taxi-found-queued-voice-v1',
        };
      }
      return {
        ...common,
        title: 'Найден водитель',
        body: carStatus(ride, 'едет к вам'),
        sound: 'taxi_found.wav',
        channelId: 'ride-taxi-found-v2',
      };
    case 'driver_arriving':
      return {
        ...common,
        title: 'Водитель едет к вам',
        body: carStatus(ride, 'в пути'),
        sound: 'driver_arriving.wav',
        channelId: 'ride-driver-arriving-voice-v1',
      };
    case 'driver_waiting':
      return {
        ...common,
        title: 'Водитель приехал',
        body: carStatus(ride, 'ожидает вас'),
        sound: 'driver_arrived.wav',
        channelId: 'ride-driver-arrived-v2',
      };
    case 'in_progress':
      return {
        ...common,
        title: 'Поездка началась',
        body: 'Вы направляетесь к месту назначения',
        sound: 'ride_started.wav',
        channelId: 'ride-started-v2',
      };
    case 'completed':
      return {
        ...common,
        title: 'Поездка завершена',
        body: `${ride.paymentMethod === 'cash' ? 'Оплата наличными. ' : ride.paymentMethod === 'transfer' ? 'Оплата переводом. ' : ''}Пожалуйста, оцените поездку.`,
        sound: `${completionSound(ride).replaceAll('-', '_')}.wav`,
        channelId: ride.paymentMethod === 'cash' ? 'ride-complete-cash-voice-v1'
          : ride.paymentMethod === 'transfer' ? 'ride-complete-transfer-voice-v1' : 'ride-complete-v2',
      };
    case 'cancelled':
      return {
        ...common,
        title: 'Заказ отменён',
        body: ride.cancellationCode === 'search_timeout' ? 'Не удалось найти водителя. Попробуйте ещё раз.'
          : ride.cancellationCode === 'admin' ? 'Заказ отменён администратором.' : 'Заказ больше не активен',
        sound: ride.cancellationCode === 'search_timeout' ? 'search_timeout.wav'
          : ride.cancellationCode === 'admin' ? 'admin_cancelled.wav' : 'ride_cancelled.wav',
        channelId: ride.cancellationCode === 'search_timeout' ? 'ride-search-timeout-voice-v1'
          : ride.cancellationCode === 'admin' ? 'ride-admin-cancelled-voice-v1' : 'ride-cancelled-v2',
      };
    default:
      return null;
  }
}

export function driverOrderAvailablePush(
  orderId: string,
  priceIncreased = false,
): PushMessage {
  return {
    title: priceIncreased ? 'Стоимость заказа повышена' : 'Новый заказ',
    body: priceIncreased ? 'Пассажир повысил стоимость поездки. Примите или отклоните заказ.' : 'Примите или отклоните заказ в приложении',
    data: { orderId, role: 'driver' },
    sound: priceIncreased ? 'order_updated.wav' : 'new_order.wav',
    channelId: priceIncreased ? 'driver-order-updated-voice-v1' : 'driver-orders-v2',
  };
}

export function passengerDriverReleasedPush(ride: RideOrder): PushMessage {
  return {
    title: 'Ищем другого водителя',
    body: 'Водитель отменил поездку. Поиск другого водителя уже начался.',
    data: { orderId: ride.id },
    sound: 'driver_released.wav',
    channelId: 'ride-driver-released-voice-v1',
  };
}

export function driverRideCancelledPush(ride: RideOrder): PushMessage {
  const passengerCancelled = ride.cancellationCode === 'passenger';
  const adminCancelled = ride.cancellationCode === 'admin';
  return {
    title: passengerCancelled ? 'Пассажир отменил заказ' : adminCancelled ? 'Заказ отменён администратором' : 'Заказ отменён',
    body: 'Заказ больше не активен',
    data: { orderId: ride.id, role: 'driver' },
    sound: passengerCancelled ? 'passenger_cancelled.wav' : adminCancelled ? 'admin_cancelled.wav' : 'ride_cancelled.wav',
    channelId: passengerCancelled ? 'ride-passenger-cancelled-voice-v1'
      : adminCancelled ? 'ride-admin-cancelled-voice-v1' : 'ride-cancelled-v2',
  };
}
