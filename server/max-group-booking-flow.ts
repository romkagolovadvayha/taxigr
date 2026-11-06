import type { Address, RideOrder } from '../src/domain/models';
import { estimatePickupEtaMinutes } from '../src/domain/pickup-eta';
import { interpretConversationalBotRoute } from '../src/domain/free-text-address';

type Field = 'pickup' | 'destination';
export type GroupQuote = { pickup: Address; destination: Address; priceMinor: number; token: string };
export type GroupBookingDraft = {
  id: string;
  stage: 'pickup' | 'destination' | 'choice' | 'verify' | 'confirm' | 'waiting' | 'closed';
  raw: Partial<Record<Field, string>>;
  selected?: Partial<Record<Field, Address>>;
  choice?: { field: Field; options: Address[] };
  quote?: GroupQuote;
  quotedAt?: number;
  orderId?: string;
  passengerId?: string;
  notifiedDriverId?: string;
  optOut?: true;
};
type Dependencies = {
  resolve: (raw: string, field: Field) => Promise<{ address: Address | null; candidates: Address[] }>;
  interpretRoute: (raw: string, field: Field) => Promise<{ pickup?: string | null; destination?: string | null } | null>;
  pickupTiming: (text: string) => string | undefined;
  quote: (pickup: Address, destination: Address) => Promise<{ quote: GroupQuote; passengerId: string } | { estimateMinor: number }>;
  submit: (draft: GroupBookingDraft) => Promise<string>;
  cancel: (draft: GroupBookingDraft) => Promise<void>;
  verificationText: string;
};
export const maxGroupOrderKey = 'max-group:';
const words = (text: string) => text.normalize('NFKC').toLowerCase().replace(/ё/gu, 'е').trim();
const plain = (text: string) => words(text).replace(/[.!?]+$/u, '').trim();
const optOut = /^(?:больше не пиши(?:те)?(?: мне)?|не пиши(?:те)?(?: мне)?|отстань(?:те)?)$/iu;
const decline = /^(?:нет(?:[,\s]+спасибо)?|не надо|не нужно|уже (?:нашли|наш[её]л|нашла|уехали|уехал|уехала)|отмена|отбой|отмени(?:те)?(?: (?:такси|поездку|заказ))?|отменить(?: (?:такси|поездку|заказ))?)$/iu;
const confirm = /^(?:да|да[,\s]+давай(?:те)?|да[,\s]+можно|давай(?:те)?|подходит|соглас[её]н|согласна|согласны|подтверждаю|ок(?:ей)?|поехали|закажи(?:те)?|вызывай(?:те)?)$/iu;

export function maxGroupDriverMessage(order: RideOrder, onApproach: boolean, freshLocation: boolean): string | null {
  const driver = order.driver;
  if (!driver?.phone || !driver.vehicle.plate) return null;
  const car = [driver.vehicle.color, driver.vehicle.make, driver.vehicle.model, driver.vehicle.plate].filter(Boolean).join(' ');
  const eta = estimatePickupEtaMinutes({
    driver: onApproach && freshLocation ? driver.coordinates : null, pickup: order.pickup.coordinates, status: order.status,
  });
  const time = eta === 0 ? 'Машина уже на месте.' : eta != null ? `Будет примерно через ${eta} мин.` :
    onApproach ? 'Время подачи можно уточнить у водителя.' : 'Водитель освободится после текущей поездки.';
  return `${time} ${car}. Водитель: ${driver.phone}`;
}

function addressPrompt(field: Field) {
  return field === 'pickup' ? 'Откуда забрать? Напишите адрес или ориентир.' : 'Куда едем? Напишите адрес или название места.';
}
function confirmation(quote: GroupQuote) {
  return `${quote.pickup.label} → ${quote.destination.label}. ${quote.priceMinor / 100} ₽, наличными. Подходит?`;
}

export async function advanceMaxGroupBooking(draft: GroupBookingDraft, input: string, deps: Dependencies, sentAt = Date.now()): Promise<string | null> {
  const text = input.trim();
  const normalized = plain(text);
  if (draft.stage === 'closed' || !text) return null;
  if (optOut.test(normalized)) {
    draft.stage = 'closed';
    draft.optOut = true;
    return null;
  }
  if (decline.test(normalized)) {
    if (draft.stage === 'waiting') await deps.cancel(draft);
    draft.stage = 'closed';
    return 'Хорошо, отменили.';
  }
  if (draft.stage === 'waiting') return null;
  if (text.length > 520) return 'Напишите адреса покороче, пожалуйста.';
  if (deps.pickupTiming(text)) return 'Здесь можно договориться на ближайшую подачу. Если нужно сейчас, напишите откуда и куда.';
  const priceRoute = async () => {
    const resolved: Partial<Record<Field, Address>> = { ...draft.selected };
    const fields = ['pickup', 'destination'] as const;
    const lookups = await Promise.all(fields.map(field => draft.raw[field] && !resolved[field] ? deps.resolve(draft.raw[field]!, field) : null));
    for (const [index, field] of fields.entries()) {
      const raw = draft.raw[field];
      if (!raw) {
        draft.stage = field;
        return addressPrompt(field);
      }
      if (resolved[field]) continue;
      const result = lookups[index]!;
      if (result.address) {
        resolved[field] = result.address;
        draft.selected = resolved;
        continue;
      }
      if (result.candidates.length > 1) {
        draft.stage = 'choice';
        draft.choice = { field, options: result.candidates };
        return `${field === 'pickup' ? 'Откуда' : 'Куда'} именно?\n${result.candidates.map((option, index) => `${index + 1}. ${option.label}`).join('\n')}`;
      }
      draft.stage = field;
      return `Не разобрал адрес. ${addressPrompt(field)}`;
    }
    if (resolved.pickup!.id === resolved.destination!.id ||
        resolved.pickup!.label.toLowerCase() === resolved.destination!.label.toLowerCase()) {
      draft.stage = 'destination';
      draft.selected = { pickup: resolved.pickup };
      return 'Подача и место назначения совпадают. Куда едем?';
    }
    const priced = await deps.quote(resolved.pickup!, resolved.destination!);
    if ('estimateMinor' in priced) {
      draft.stage = 'verify';
      return `${resolved.pickup!.label} → ${resolved.destination!.label}. Обычная цена ${priced.estimateMinor / 100} ₽. ${deps.verificationText}`;
    }
    draft.stage = 'confirm';
    draft.quote = priced.quote;
    draft.quotedAt = Date.now();
    draft.passengerId = priced.passengerId;
    return confirmation(priced.quote);
  };
  if (draft.stage === 'verify' && /^(?:готово|вош[её]л|вошла|подтвердил[аи]?)$/iu.test(normalized)) return priceRoute();
  if (draft.stage === 'confirm' && confirm.test(normalized) && !text.includes('?')) {
    if (draft.quotedAt && sentAt < draft.quotedAt) return confirmation(draft.quote!);
    try {
      draft.orderId = await deps.submit(draft);
      draft.stage = 'waiting';
      return null;
    } catch (error) {
      const code = (error as { code?: string }).code;
      if (['QUOTE_EXPIRED_OR_INVALID', 'PROMOTION_QUOTE_CHANGED', 'QUOTE_ADDRESS_MISMATCH', 'PHONE_VERIFICATION_REQUIRED'].includes(code ?? '')) {
        return priceRoute();
      }
      if (code === 'LEGAL_CONSENT_REQUIRED') {
        draft.stage = 'verify';
        return deps.verificationText;
      }
      if (code === 'ACTIVE_ORDER_EXISTS') {
        draft.stage = 'closed';
        return 'У вас уже есть активная поездка.';
      }
      throw error;
    }
  }
  if (draft.stage === 'choice' && draft.choice && /^\d{1,2}$/u.test(normalized)) {
    const { field, options } = draft.choice;
    const selected = options[Number(normalized) - 1];
    if (!selected) return 'Напишите номер из списка или уточните адрес.';
    draft.selected = { ...draft.selected, [field]: selected };
    draft.choice = undefined;
    return priceRoute();
  }
  const field = draft.choice?.field ?? (draft.stage === 'destination' ? 'destination' : 'pickup');
  if (confirm.test(normalized) || /^(?:привет|здравствуй(?:те)?|спасибо|еще актуально|актуально)$/iu.test(normalized)) {
    if (draft.stage === 'verify') return deps.verificationText;
    if (draft.stage === 'confirm' && draft.quote) return confirmation(draft.quote);
    return addressPrompt(field);
  }
  const correction = /^(?:откуда|подача|забрать)\s*[:—-]\s*(.+)$/iu.exec(text) ??
    /^(?:куда|назначение|отвезти)\s*[:—-]\s*(.+)$/iu.exec(text);
  const pair = correction ? null : await interpretConversationalBotRoute(text, field, deps.interpretRoute);
  if (pair?.every(value => value.length >= 2 && value.length <= 255)) {
    draft.raw = { pickup: pair[0], destination: pair[1] };
    draft.selected = {};
    draft.choice = undefined;
    return priceRoute();
  }
  if ((draft.stage === 'confirm' || draft.stage === 'verify') && !correction) {
    if (/сколько|цен[ау]|стоимост/iu.test(text) && draft.stage === 'confirm' && draft.quote) return confirmation(draft.quote);
    return 'Если адрес изменился, напишите «Откуда: адрес» или «Куда: адрес».';
  }
  const value = correction?.[1]?.trim() ?? text;
  if (value.length < 2 || value.length > 255) return addressPrompt(field);
  const side = correction ? /^(?:куда|назначение|отвезти)/iu.test(correction[0]) ? 'destination' : 'pickup' : field;
  draft.raw[side] = value;
  draft.selected = { ...draft.selected, [side]: undefined };
  draft.choice = undefined;
  return priceRoute();
}
