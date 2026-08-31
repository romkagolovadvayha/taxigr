import type {
  OpeningInterval,
  PlaceCategory,
  PlaceDirectoryEntry,
  Weekday,
  WeeklySchedule,
} from './models';

export const weekdayOrder: Weekday[] = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];

export const weekdayLabels: Record<Weekday, string> = {
  mon: 'Понедельник',
  tue: 'Вторник',
  wed: 'Среда',
  thu: 'Четверг',
  fri: 'Пятница',
  sat: 'Суббота',
  sun: 'Воскресенье',
};

const weekdayShortLabels: Record<Weekday, string> = {
  mon: 'пн',
  tue: 'вт',
  wed: 'ср',
  thu: 'чт',
  fri: 'пт',
  sat: 'сб',
  sun: 'вс',
};

export const placeCategoryLabels: Record<PlaceCategory, string> = {
  food: 'Кафе и еда',
  shopping: 'Магазины',
  pharmacy: 'Аптеки',
  health: 'Медицина',
  delivery: 'Пункты выдачи',
  finance: 'Банки и платежи',
  government: 'Госуслуги',
  education: 'Образование',
  culture: 'Культура и досуг',
  sport: 'Спорт',
  auto: 'Авто',
  services: 'Услуги',
  other: 'Другое',
};

const categorySearchTerms: Record<PlaceCategory, string[]> = {
  food: ['кафе', 'еда', 'кофе', 'столовая', 'караоке', 'перекусить'],
  shopping: ['магазин', 'магазины', 'продукты', 'супермаркет', 'покупки'],
  pharmacy: ['аптека', 'аптеки', 'лекарства'],
  health: ['больница', 'медицина', 'врач', 'поликлиника'],
  delivery: ['пункт выдачи', 'посылка', 'пвз', 'доставка'],
  finance: ['банк', 'банкомат', 'деньги', 'платежи'],
  government: ['мфц', 'администрация', 'почта', 'полиция', 'госуслуги'],
  education: ['школа', 'детский сад', 'образование'],
  culture: ['музей', 'культура', 'досуг', 'церковь', 'дом культуры'],
  sport: ['спорт', 'спортшкола', 'секция'],
  auto: ['азс', 'заправка', 'автомойка', 'автосервис', 'машина'],
  services: ['услуги', 'организация'],
  other: ['место', 'организация'],
};

const emptyIntervals = (): OpeningInterval[] => [];

export function createEmptySchedule(): WeeklySchedule {
  return {
    mon: emptyIntervals(),
    tue: emptyIntervals(),
    wed: emptyIntervals(),
    thu: emptyIntervals(),
    fri: emptyIntervals(),
    sat: emptyIntervals(),
    sun: emptyIntervals(),
  };
}

function normalize(value: string): string {
  return value
    .toLocaleLowerCase('ru')
    .replace(/ё/gu, 'е')
    .replace(/[«»"'`]/gu, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

function searchTokens(value: string): string[] {
  return normalize(value)
    .split(' ')
    .filter((token) => token.length > 1);
}

function editDistance(left: string, right: string): number {
  const previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let leftIndex = 1; leftIndex <= left.length; leftIndex += 1) {
    const current = [leftIndex];
    for (let rightIndex = 1; rightIndex <= right.length; rightIndex += 1) {
      current[rightIndex] = Math.min(
        (current[rightIndex - 1] ?? 0) + 1,
        (previous[rightIndex] ?? 0) + 1,
        (previous[rightIndex - 1] ?? 0) +
          (left[leftIndex - 1] === right[rightIndex - 1] ? 0 : 1),
      );
    }
    previous.splice(0, previous.length, ...current);
  }
  return previous[right.length] ?? Math.max(left.length, right.length);
}

function tokenScore(queryToken: string, candidateToken: string): number {
  if (candidateToken === queryToken) return 30;
  if (candidateToken.startsWith(queryToken)) return 18;
  if (queryToken.length >= 3 && candidateToken.includes(queryToken)) return 10;
  if (
    candidateToken.length >= 4 &&
    candidateToken.length / queryToken.length >= 0.75 &&
    queryToken.includes(candidateToken)
  ) {
    return 10;
  }
  if (queryToken.length >= 4 && candidateToken.length >= 4 && editDistance(queryToken, candidateToken) <= 1) {
    return 7;
  }
  return 0;
}

export function placeSearchScore(
  place: Pick<PlaceDirectoryEntry, 'name' | 'aliases' | 'category' | 'description' | 'addressLabel'>,
  query: string,
): number {
  const queryValue = normalize(query);
  const queryParts = searchTokens(queryValue);
  if (!queryParts.length) return 1;

  const name = normalize(place.name);
  const aliases = place.aliases.map(normalize);
  const categoryTerms = categorySearchTerms[place.category];
  const candidateTokens = searchTokens(
    [place.name, ...place.aliases, placeCategoryLabels[place.category], ...categoryTerms, place.description, place.addressLabel]
      .filter(Boolean)
      .join(' '),
  );
  let score = name === queryValue ? 120 : name.startsWith(queryValue) ? 80 : 0;
  if (aliases.includes(queryValue)) score += 100;

  for (const queryPart of queryParts) {
    const best = candidateTokens.reduce(
      (current, candidate) => Math.max(current, tokenScore(queryPart, candidate)),
      0,
    );
    if (!best) return 0;
    score += best;
  }
  return score;
}

function parseTime(value: string): number | null {
  const match = /^(\d{2}):(\d{2})$/u.exec(value);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return null;
  return hours * 60 + minutes;
}

function formatTime(minutes: number): string {
  const normalized = ((minutes % 1440) + 1440) % 1440;
  return `${String(Math.floor(normalized / 60)).padStart(2, '0')}:${String(normalized % 60).padStart(2, '0')}`;
}

const englishWeekdayMap: Record<string, Weekday> = {
  Mon: 'mon',
  Tue: 'tue',
  Wed: 'wed',
  Thu: 'thu',
  Fri: 'fri',
  Sat: 'sat',
  Sun: 'sun',
};

function samaraNowParts(now: Date): { weekday: Weekday; minutes: number } {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Europe/Samara',
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(now);
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return {
    weekday: englishWeekdayMap[value.weekday ?? 'Mon'] ?? 'mon',
    minutes: Number(value.hour ?? 0) * 60 + Number(value.minute ?? 0),
  };
}

export type PlaceOpenStatus = {
  kind: 'open' | 'closed' | 'unknown';
  label: string;
};

function validIntervals(intervals: OpeningInterval[]): { opens: number; closes: number }[] {
  return intervals.flatMap((interval) => {
    const opens = parseTime(interval.opensAt);
    const closes = parseTime(interval.closesAt);
    return opens === null || closes === null ? [] : [{ opens, closes }];
  });
}

export function getPlaceOpenStatus(
  schedule: WeeklySchedule | undefined,
  now = new Date(),
): PlaceOpenStatus {
  if (!schedule || !weekdayOrder.some((weekday) => schedule[weekday]?.length)) {
    return { kind: 'unknown', label: 'Режим не указан' };
  }

  const { weekday, minutes } = samaraNowParts(now);
  const weekdayIndex = weekdayOrder.indexOf(weekday);
  const today = validIntervals(schedule[weekday] ?? []);
  const previousWeekday = weekdayOrder[(weekdayIndex + 6) % 7] ?? 'sun';
  const previous = validIntervals(schedule[previousWeekday] ?? []);

  for (const interval of previous) {
    if (interval.closes <= interval.opens && minutes < interval.closes) {
      return { kind: 'open', label: `Открыто до ${formatTime(interval.closes)}` };
    }
  }
  for (const interval of today) {
    if (interval.opens === interval.closes) {
      return { kind: 'open', label: 'Открыто круглосуточно' };
    }
    if (interval.closes > interval.opens && minutes >= interval.opens && minutes < interval.closes) {
      return { kind: 'open', label: `Открыто до ${formatTime(interval.closes)}` };
    }
    if (interval.closes < interval.opens && minutes >= interval.opens) {
      return { kind: 'open', label: `Открыто до ${formatTime(interval.closes)}` };
    }
  }

  for (let offset = 0; offset <= 7; offset += 1) {
    const targetWeekday = weekdayOrder[(weekdayIndex + offset) % 7] ?? weekday;
    const intervals = validIntervals(schedule[targetWeekday] ?? []).sort((a, b) => a.opens - b.opens);
    const next = intervals.find((interval) => offset > 0 || interval.opens > minutes);
    if (!next) continue;
    const day =
      offset === 0
        ? ''
        : offset === 1
          ? 'завтра, '
          : `${weekdayShortLabels[targetWeekday]}, `;
    return { kind: 'closed', label: `Закрыто до ${day}${formatTime(next.opens)}` };
  }

  return { kind: 'closed', label: 'Закрыто' };
}
