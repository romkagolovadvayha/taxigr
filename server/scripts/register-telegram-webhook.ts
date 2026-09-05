import { db } from '../db';
import { closeGatewayDispatcher } from '../gateway-proxy';
import { registerTelegramWebhook } from '../telegram-webhook';

try {
  const status = await registerTelegramWebhook();
  console.log(JSON.stringify(status));
} catch {
  // Signed callback URLs, bot tokens and proxy credentials must not enter CI logs.
  console.error('Telegram webhook registration failed. Check the gateway settings in the superadmin panel.');
  process.exitCode = 1;
} finally {
  await closeGatewayDispatcher();
  await db.end();
}
