import { rememberMiniAppLaunch, restoredMiniAppLaunch, type MiniAppProvider } from './runtime';

export type MiniAppContact = { phone: string; authDate: string; hash: string };
export type MiniAppBridge = {
  initData: string;
  ready?: () => void;
  expand?: () => void;
  BackButton?: { show: () => void; hide: () => void; onClick: (callback: () => void) => void; offClick: (callback: () => void) => void };
  requestContact: ((callback: (shared: boolean) => void) => void) | (() => Promise<MiniAppContact>);
};
type BridgeWindow = Window & { WebApp?: MiniAppBridge; Telegram?: { WebApp?: MiniAppBridge } };
const loads = new Map<MiniAppProvider, Promise<MiniAppBridge>>();

export function loadMiniAppBridge(provider: MiniAppProvider): Promise<MiniAppBridge> {
  const previous = loads.get(provider);
  if (previous) return previous;
  const load = new Promise<MiniAppBridge>((resolve, reject) => {
    if (typeof window === 'undefined') { reject(new Error('Откройте заказ внутри мессенджера.')); return; }
    const read = () => provider === 'max' ? (window as BridgeWindow).WebApp : (window as BridgeWindow).Telegram?.WebApp;
    const finish = () => {
      const bridge = read();
      const initData = bridge?.initData || restoredMiniAppLaunch();
      if (!bridge || !initData) { reject(new Error(`Откройте «Заказать такси» в боте ${provider === 'max' ? 'MAX' : 'Telegram'}.`)); return; }
      rememberMiniAppLaunch(provider, initData);
      bridge.ready?.();
      bridge.expand?.();
      resolve({ ...bridge, initData, requestContact: bridge.requestContact.bind(bridge), BackButton: bridge.BackButton });
    };
    if (read()) { finish(); return; }
    const script = document.createElement('script');
    script.src = provider === 'max' ? 'https://st.max.ru/js/max-web-app.js' : 'https://telegram.org/js/telegram-web-app.js';
    script.async = true;
    const timer = setTimeout(() => { script.remove(); reject(new Error('Мессенджер не ответил. Проверьте соединение и повторите.')); }, 12000);
    script.onload = () => { clearTimeout(timer); finish(); };
    script.onerror = () => { clearTimeout(timer); script.remove(); reject(new Error('Не удалось подключиться к мессенджеру. Повторите попытку.')); };
    document.head.appendChild(script);
  });
  loads.set(provider, load);
  void load.catch(() => loads.delete(provider));
  return load;
}

export function requestMiniAppContact(provider: MiniAppProvider, bridge: MiniAppBridge): Promise<MiniAppContact | null> {
  if (provider === 'max') return (bridge.requestContact as () => Promise<MiniAppContact>)();
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Подтверждение номера не завершено. Попробуйте ещё раз.')), 60000);
    (bridge.requestContact as (callback: (shared: boolean) => void) => void)(shared => {
      clearTimeout(timer);
      if (shared) resolve(null);
      else reject(new Error('Для заказа поделитесь номером: водитель сможет связаться с вами.'));
    });
  });
}
