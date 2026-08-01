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

export async function loadYandexMap(): Promise<NonNullable<Window['ymaps3']>> {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    throw new Error('Карта доступна только в браузере');
  }
  if (window.ymaps3) {
    await window.ymaps3.ready;
    return window.ymaps3;
  }
  if (loader) return loader;

  const apiKey = process.env.EXPO_PUBLIC_YANDEX_MAPS_API_KEY;
  if (!apiKey) throw new Error('Не настроен ключ Яндекс Карт');

  loader = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = `https://api-maps.yandex.ru/v3/?apikey=${encodeURIComponent(apiKey)}&lang=ru_RU`;
    script.async = true;
    script.onload = async () => {
      if (!window.ymaps3) {
        reject(new Error('Яндекс Карты не загрузились'));
        return;
      }
      await window.ymaps3.ready;
      resolve(window.ymaps3);
    };
    script.onerror = () => reject(new Error('Не удалось загрузить Яндекс Карты'));
    document.head.appendChild(script);
  });

  return loader;
}
