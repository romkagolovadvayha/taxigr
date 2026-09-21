import { Alert, Platform } from 'react-native';

import { readLocationConsent, writeLocationConsent } from './location-consent-storage';

export const locationDisclosures = {
  pickup: {
    title: 'Геолокация для места подачи',
    message: '«Такси Грахово» получает ваше точное местоположение, чтобы определить адрес и точку подачи на карте. Координаты передаются серверу сервиса и поставщику поиска адресов. После оформления заказа выбранную точку подачи увидит назначенный водитель. Доступ выполняется при использовании приложения.\n\nПередача водителю вашей текущей геопозиции включается отдельно в настройках и по умолчанию выключена. Можно отказаться и указать адрес вручную.',
  },
  sharing: {
    title: 'Передавать геолокацию водителю?',
    message: '«Такси Грахово» собирает ваше точное местоположение и передаёт его через сервер сервиса назначенному водителю, чтобы он нашёл вас в месте встречи. Геопозиция обновляется только при открытом приложении и активном заказе с назначенным водителем.\n\nПередача прекращается при выключении этой настройки, отмене или завершении поездки; текущая координата заказа удаляется. Можно отказаться — заказ такси останется доступен.',
  },
  driver: {
    title: 'Геолокация водителя',
    message: '«Такси Грахово» собирает ваше точное местоположение во время работы на линии или активной поездки. Координаты передаются серверу сервиса и диспетчеру для распределения заказов, пассажиру вашего заказа — для показа автомобиля на карте, а поставщику маршрутов — для навигации.\n\nЭтот доступ работает при открытом приложении. Для работы при свёрнутом или закрытом приложении мы отдельно запросим согласие. Чтобы прекратить передачу, завершите поездку и выйдите с линии.',
  },
  background: {
    title: 'Геолокация водителя в фоне',
    message: '«Такси Грахово» собирает ваше точное местоположение, даже когда приложение закрыто или не используется, пока вы на линии или выполняете поездку. Координаты передаются серверу сервиса и диспетчеру для распределения заказов, пассажиру вашего заказа — для показа автомобиля на карте и сопровождения поездки.\n\nПередача прекращается после завершения поездки и выхода с линии или выхода из аккаунта. Можно отказаться и работать с открытым приложением.',
  },
} as const;

export type LocationPurpose = keyof typeof locationDisclosures;

const pending = new Map<LocationPurpose, Promise<boolean>>();

export function confirmLocationDisclosure(purpose: LocationPurpose): Promise<boolean> {
  const disclosure = locationDisclosures[purpose];
  if (Platform.OS === 'web') {
    return Promise.resolve(globalThis.confirm?.(`${disclosure.title}\n\n${disclosure.message}`) ?? false);
  }
  return new Promise((resolve) => {
    Alert.alert(disclosure.title, disclosure.message, [
      { text: 'Не разрешать', style: 'cancel', onPress: () => resolve(false) },
      { text: 'Разрешить', onPress: () => resolve(true) },
    ], { cancelable: true, onDismiss: () => resolve(false) });
  });
}

export function ensureLocationConsent(purpose: LocationPurpose): Promise<boolean> {
  const existing = pending.get(purpose);
  if (existing) return existing;
  const request = (async () => {
    if (purpose !== 'sharing' && await readLocationConsent(purpose)) return true;
    if (!await confirmLocationDisclosure(purpose)) return false;
    if (purpose !== 'sharing') await writeLocationConsent(purpose);
    return true;
  })().finally(() => pending.delete(purpose));
  pending.set(purpose, request);
  return request;
}
