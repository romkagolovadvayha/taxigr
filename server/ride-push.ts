import type { RideOrder } from '../src/domain/models';
import type { PushMessage } from './push';

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
          sound: 'taxi_found.wav',
          channelId: 'ride-taxi-found-v2',
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
        sound: 'taxi_found.wav',
        channelId: 'ride-taxi-found-v2',
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
        body: 'Спасибо за поездку',
        sound: 'ride_complete.wav',
        channelId: 'ride-complete-v2',
      };
    case 'cancelled':
      return {
        ...common,
        title: 'Заказ отменён',
        body: 'Заказ больше не активен',
        sound: 'ride_cancelled.wav',
        channelId: 'ride-cancelled-v2',
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
    body: 'Откройте приложение, чтобы посмотреть детали',
    data: { orderId, role: 'driver' },
    sound: 'new_order.wav',
    channelId: 'driver-orders-v2',
  };
}
