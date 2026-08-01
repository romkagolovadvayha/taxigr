import { describe, expect, it } from 'vitest';

import { formatCriticalErrorReport } from '../server/critical-telegram';

describe('Telegram critical error reports', () => {
  it('includes error context and stack', () => {
    const error = new Error('Database unavailable');
    const message = formatCriticalErrorReport({
      source: 'api',
      error,
      context: [
        ['HTTP', 'POST /v1/orders'],
        ['Статус', 500],
      ],
    });

    expect(message).toContain('🚨 CRITICAL ERROR');
    expect(message).toContain('Источник: API');
    expect(message).toContain('Ошибка: Database unavailable');
    expect(message).toContain('HTTP: POST /v1/orders');
    expect(message).toContain('Stack:');
  });

  it('redacts credentials from messages and stacks', () => {
    const token = '123456789:abcdefghijklmnopqrstuvwxyzABCDE';
    const error = new Error(`request failed for bot${token} Bearer secret.session.token`);
    const message = formatCriticalErrorReport({ source: 'server-process', error });

    expect(message).not.toContain(token);
    expect(message).not.toContain('secret.session.token');
    expect(message).toContain('[REDACTED]');
  });

  it('keeps critical logs within the Telegram message limit', () => {
    const error = new Error('x'.repeat(10_000));
    error.stack = 'y'.repeat(20_000);
    const message = formatCriticalErrorReport({ source: 'client', error });

    expect(message.length).toBeLessThanOrEqual(4_096);
  });

  it('labels browser reports as frontend errors', () => {
    const message = formatCriticalErrorReport({
      source: 'client',
      error: new Error('Chunk failed to load'),
    });

    expect(message).toContain('🚨 FRONTEND ERROR');
  });
});
