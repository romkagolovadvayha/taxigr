import { config } from './config';
import { sendTelegramMessage } from './telegram-bot';

export type AdminTelegramAction = {
  icon?: string;
  title: string;
  actor?: {
    role: 'пассажир' | 'водитель' | 'администратор';
    id: string;
    name?: string | null;
    phone?: string | null;
  };
  entity?: {
    label: string;
    id: string;
  };
  details?: ReadonlyArray<readonly [label: string, value: unknown]>;
};

const TELEGRAM_MESSAGE_LIMIT = 4_096;

function clean(value: unknown): string | null {
  if (value === undefined || value === null || value === '') return null;
  const text = String(value)
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/gu, '')
    .trim();
  if (!text) return null;
  return text.length > 600 ? `${text.slice(0, 597)}…` : text;
}

export function formatMoney(minor: number): string {
  return `${new Intl.NumberFormat('ru-RU').format(minor / 100)} ₽`;
}

export function formatAdminTelegramAction(action: AdminTelegramAction): string {
  const lines = [`${action.icon ?? '🔔'} ${action.title}`];

  if (action.actor) {
    const identity = [clean(action.actor.name), clean(action.actor.phone)]
      .filter((value): value is string => Boolean(value))
      .join(' · ');
    lines.push(
      `Кто: ${action.actor.role}${identity ? ` — ${identity}` : ''}`,
      `ID пользователя: ${action.actor.id}`,
    );
  }

  if (action.entity) lines.push(`${action.entity.label}: ${action.entity.id}`);

  for (const [label, rawValue] of action.details ?? []) {
    const value = clean(rawValue);
    if (value) lines.push(`${label}: ${value}`);
  }

  const message = lines.join('\n');
  return message.length <= TELEGRAM_MESSAGE_LIMIT
    ? message
    : `${message.slice(0, TELEGRAM_MESSAGE_LIMIT - 1)}…`;
}

export async function sendAdminTelegramAction(action: AdminTelegramAction): Promise<void> {
  if (!config.TELEGRAM_BOT_TOKEN) return;
  await sendTelegramMessage(config.TELEGRAM_ADMIN_CHAT_ID, {
    text: formatAdminTelegramAction(action),
    disable_web_page_preview: true,
  });
}
