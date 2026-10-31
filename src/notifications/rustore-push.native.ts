import Constants from 'expo-constants';
import { NativeEventEmitter, NativeModules, Platform } from 'react-native';

import type { PushTokenSubscription } from './rustore-push';

type RuStorePushModule = {
  addListener: (eventName: string) => void;
  removeListeners: (count: number) => void;
  createPushEmitter: () => void;
  deletePushEmitter: () => void;
  checkPushAvailability: () => Promise<boolean | string>;
  getToken: () => Promise<string>;
  offNativeErrorHandling: () => void;
};

function getModule(): RuStorePushModule {
  const module = NativeModules.RustorePush as RuStorePushModule | undefined;
  if (!module) {
    throw new Error('В этой сборке отсутствует модуль RuStore Push. Установите актуальную версию приложения.');
  }
  return module;
}

export function isRuStorePushEnabled(): boolean {
  return Platform.OS === 'android' &&
    Constants.expoConfig?.extra?.nativePushProvider === 'rustore';
}

export async function getRuStorePushToken(): Promise<string | null> {
  const module = getModule();
  module.offNativeErrorHandling();
  const availability = await module.checkPushAvailability();
  if (availability !== true) {
    throw new Error('RuStore Push недоступен на устройстве. Проверьте, что RuStore установлен и обновлён, откройте его и повторите подключение уведомлений.');
  }
  const token = await module.getToken();
  if (!token?.trim()) throw new Error('RuStore не вернул push-токен. Проверьте интернет и повторите подключение уведомлений.');
  return token;
}

export function addRuStorePushTokenListener(
  listener: (token: string) => void,
): PushTokenSubscription {
  const module = getModule();
  module.offNativeErrorHandling();
  module.createPushEmitter();
  const emitter = new NativeEventEmitter(module);
  const subscription = emitter.addListener(
    'ON_NEW_TOKEN',
    (payload: string | { token?: string }) => {
      const token = typeof payload === 'string' ? payload : payload?.token;
      if (token) listener(token);
    },
  );
  return {
    remove: () => {
      subscription.remove();
      module.deletePushEmitter();
    },
  };
}
