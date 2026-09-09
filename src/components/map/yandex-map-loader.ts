import { installYandexMapCancellationHandler } from './yandex-map-errors';

declare global {
  interface Window {
    ymaps3?: {
      ready: Promise<void>;
      YMap: new (element: HTMLElement, props: unknown, children?: unknown[]) => YandexMap;
      YMapDefaultSchemeLayer: new (props?: unknown) => unknown;
      YMapDefaultFeaturesLayer: new (props?: unknown) => unknown;
      YMapFeature: new (props: unknown) => YandexMapEntity;
      YMapMarker: new (props: unknown, element: HTMLElement) => YandexMapEntity;
      YMapListener: new (props: {
        layer: 'any';
        onUpdate?: (event: { location: { zoom: number } }) => void;
        onClick?: (object: unknown, event: { coordinates: [number, number] }) => void;
      }) => unknown;
    };
  }
}

export type YandexMapEntity = {
  update: (props: unknown) => void;
};

export type YandexMap = {
  addChild: (child: unknown) => YandexMap;
  removeChild: (child: unknown) => YandexMap;
  destroy: () => void;
  update: (props: unknown) => void;
};

let loader: Promise<NonNullable<Window['ymaps3']>> | null = null;
const LOAD_TIMEOUT_MS = 15_000;

export async function loadYandexMap(): Promise<NonNullable<Window['ymaps3']>> {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    throw new Error('Карта доступна только в браузере');
  }
  // Keep the narrow cancellation filter after maps unmount, when SDK aborts arrive.
  installYandexMapCancellationHandler(window);
  if (loader) return loader;

  const apiKey = process.env.EXPO_PUBLIC_YANDEX_MAPS_API_KEY;
  if (!window.ymaps3 && !apiKey) throw new Error('Не настроен ключ Яндекс Карт');

  loader = new Promise<NonNullable<Window['ymaps3']>>((resolve, reject) => {
    let script: HTMLScriptElement | undefined;
    let settled = false;
    const cleanup = () => {
      clearTimeout(timeout);
      if (script) {
        script.onload = null;
        script.onerror = null;
      }
    };
    const fail = (reason: unknown) => {
      if (settled) return;
      settled = true;
      cleanup();
      script?.remove();
      reject(reason);
    };
    const timeout = setTimeout(() => fail(new Error('Загрузка Яндекс Карт заняла слишком много времени')), LOAD_TIMEOUT_MS);
    const waitForApi = () => {
      const api = window.ymaps3;
      if (!api) {
        fail(new Error('Яндекс Карты не загрузились'));
        return;
      }
      // Do not use an async onload: a rejected ready promise must settle our loader.
      void Promise.resolve(api.ready).then(() => {
        if (settled) return;
        settled = true;
        cleanup();
        resolve(api);
      }, fail);
    };
    if (window.ymaps3) waitForApi();
    else {
      script = document.createElement('script');
      script.src = `https://api-maps.yandex.ru/v3/?apikey=${encodeURIComponent(apiKey!)}&lang=ru_RU`;
      script.async = true;
      script.onload = waitForApi;
      script.onerror = () => fail(new Error('Не удалось загрузить Яндекс Карты'));
      document.head.appendChild(script);
    }
  }).catch((reason: unknown) => {
    loader = null;
    throw reason;
  });

  return loader;
}
