export type VehicleColorOption = {
  key: string;
  name: string;
  hex: string;
};

export const vehicleColorOptions: VehicleColorOption[] = [
  { key: 'white', name: 'Белая', hex: '#F7F7F2' },
  { key: 'black', name: 'Чёрная', hex: '#171717' },
  { key: 'silver', name: 'Серебристая', hex: '#B8BDC4' },
  { key: 'gray', name: 'Серая', hex: '#777C84' },
  { key: 'graphite', name: 'Графитовая', hex: '#454A52' },
  { key: 'blue', name: 'Синяя', hex: '#2F6FED' },
  { key: 'navy', name: 'Тёмно-синяя', hex: '#193C70' },
  { key: 'red', name: 'Красная', hex: '#D64545' },
  { key: 'burgundy', name: 'Бордовая', hex: '#721F2C' },
  { key: 'green', name: 'Зелёная', hex: '#2F7D4A' },
  { key: 'dark-green', name: 'Тёмно-зелёная', hex: '#1F5134' },
  { key: 'beige', name: 'Бежевая', hex: '#D8C3A5' },
  { key: 'brown', name: 'Коричневая', hex: '#6B4634' },
  { key: 'yellow', name: 'Жёлтая', hex: '#F4C400' },
  { key: 'orange', name: 'Оранжевая', hex: '#E97926' },
  { key: 'gold', name: 'Золотистая', hex: '#C9A227' },
  { key: 'violet', name: 'Фиолетовая', hex: '#6B4DA0' },
];

export const fallbackVehicleColorHex = '#777C84';

export type VehicleColorPalette = {
  body: string;
  highlight: string;
  shadow: string;
};

export function isVehicleColorHex(value: string | null | undefined): value is string {
  return typeof value === 'string' && /^#[0-9A-F]{6}$/i.test(value);
}

export function normalizeVehicleColorHex(value: string | null | undefined): string {
  return isVehicleColorHex(value) ? value.toUpperCase() : fallbackVehicleColorHex;
}

function mixHexColors(baseHex: string, mixHex: string, amount: number): string {
  const base = normalizeVehicleColorHex(baseHex).slice(1);
  const mix = normalizeVehicleColorHex(mixHex).slice(1);
  const channel = (offset: number) => {
    const baseValue = Number.parseInt(base.slice(offset, offset + 2), 16);
    const mixValue = Number.parseInt(mix.slice(offset, offset + 2), 16);
    return Math.round(baseValue + (mixValue - baseValue) * amount)
      .toString(16)
      .padStart(2, '0')
      .toUpperCase();
  };

  return `#${channel(0)}${channel(2)}${channel(4)}`;
}

export function createVehicleColorPalette(
  value: string | null | undefined,
): VehicleColorPalette {
  const body = normalizeVehicleColorHex(value);
  return {
    body,
    highlight: mixHexColors(body, '#FFFFFF', 0.32),
    shadow: mixHexColors(body, '#000000', 0.28),
  };
}

export function inferVehicleColorHex(name: string): string {
  const normalized = name.trim().toLocaleLowerCase('ru-RU');
  const exact = vehicleColorOptions.find((option) => option.name.toLocaleLowerCase('ru-RU') === normalized);
  if (exact) return exact.hex;

  const aliases: [RegExp, string][] = [
    [/бел|слонов|молоч/, '#F7F7F2'],
    [/ч[её]рн/, '#171717'],
    [/серебр/, '#B8BDC4'],
    [/графит|антрацит/, '#454A52'],
    [/сер|мокр.*асфальт/, '#777C84'],
    [/т[её]мн.*син|navy/, '#193C70'],
    [/син|голуб/, '#2F6FED'],
    [/борд|вишн/, '#721F2C'],
    [/красн/, '#D64545'],
    [/т[её]мн.*зел/, '#1F5134'],
    [/зел/, '#2F7D4A'],
    [/беж|песоч/, '#D8C3A5'],
    [/коричн|кофе/, '#6B4634'],
    [/ж[её]лт/, '#F4C400'],
    [/оранж/, '#E97926'],
    [/золот/, '#C9A227'],
    [/фиолет|сирен/, '#6B4DA0'],
  ];
  return aliases.find(([pattern]) => pattern.test(normalized))?.[1] ?? fallbackVehicleColorHex;
}
