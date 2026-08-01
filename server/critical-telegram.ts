import { config } from './config';
import { sendTelegramMessage } from './telegram-bot';

export type CriticalErrorReport = {
  source: 'api' | 'server-process' | 'client';
  error: unknown;
  context?: readonly (readonly [label: string, value: unknown])[];
};

const TELEGRAM_MESSAGE_LIMIT = 4_096;

function redactSecrets(value: string): string {
  return value
    .replace(/Bearer\s+[A-Za-z0-9._~-]+/giu, 'Bearer [REDACTED]')
    .replace(/bot\d{6,}:[A-Za-z0-9_-]{20,}/gu, 'bot[REDACTED]')
    .replace(/([?&](?:token|access_token|exchangeToken)=)[^&\s]+/giu, '$1[REDACTED]');
}

function clean(value: unknown, limit = 1_200): string | null {
  if (value === undefined || value === null || value === '') return null;
  const text = redactSecrets(String(value))
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/gu, '')
    .trim();
  if (!text) return null;
  return text.length > limit ? `${text.slice(0, limit - 1)}…` : text;
}

function errorDetails(error: unknown): { name: string; message: string; stack?: string } {
  if (error instanceof Error) {
    return {
      name: error.name || 'Error',
      message: clean(error.message, 800) ?? 'Без сообщения',
      stack: clean(error.stack, 2_200) ?? undefined,
    };
  }
  return {
    name: 'UnknownError',
    message: clean(error, 800) ?? 'Неизвестная ошибка',
  };
}

export function formatCriticalErrorReport(report: CriticalErrorReport): string {
  const details = errorDetails(report.error);
  const source = {
    api: 'API',
    'server-process': 'Процесс сервера',
    client: 'Приложение',
  }[report.source];
  const lines = [
    report.source === 'client' ? '🚨 FRONTEND ERROR' : '🚨 CRITICAL ERROR',
    `Источник: ${source}`,
    `Тип: ${details.name}`,
    `Ошибка: ${details.message}`,
  ];

  for (const [label, rawValue] of report.context ?? []) {
    const value = clean(rawValue, 600);
    if (value) lines.push(`${label}: ${value}`);
  }
  if (details.stack) lines.push(`Stack:\n${details.stack}`);

  const message = lines.join('\n');
  return message.length <= TELEGRAM_MESSAGE_LIMIT
    ? message
    : `${message.slice(0, TELEGRAM_MESSAGE_LIMIT - 1)}…`;
}

export async function sendCriticalErrorReport(report: CriticalErrorReport): Promise<void> {
  if (!config.TELEGRAM_BOT_TOKEN) return;
  await sendTelegramMessage(config.TELEGRAM_CRITICAL_CHAT_ID, {
    text: formatCriticalErrorReport(report),
    disable_web_page_preview: true,
  });
}
