import { config } from '../config';
import { db } from '../db';
import { closeGatewayDispatcher } from '../gateway-proxy';
import { callTelegramApi } from '../telegram-bot';

try {
  if (!config.TELEGRAM_BOT_TOKEN) throw new Error('Telegram is not configured');
  const desired = { type: 'web_app', text: 'Заказать такси', web_app: { url: new URL('/telegram', config.PUBLIC_URL).href } };
  const current = await callTelegramApi<typeof desired>('getChatMenuButton', {});
  if (current.type !== desired.type || current.text !== desired.text || current.web_app?.url !== desired.web_app.url) {
    await callTelegramApi('setChatMenuButton', { menu_button: desired });
  }
  const saved = await callTelegramApi<typeof desired>('getChatMenuButton', {});
  if (saved.type !== desired.type || saved.text !== desired.text || saved.web_app?.url !== desired.web_app.url) throw new Error('Telegram menu verification failed');
  console.log(JSON.stringify({ verified: true, text: saved.text, url: saved.web_app.url }));
} catch {
  console.error('Telegram mini-app menu was not configured. Check bot access and gateway connectivity.');
  process.exitCode = 1;
} finally {
  await closeGatewayDispatcher();
  await db.end();
}
