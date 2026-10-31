# Passenger mini apps

Entry URLs: `/max`, `/telegram`, `/vk`. All use the shared passenger screens and the existing order API, tariffs, real-time events and chat.

MAX and Telegram launch data is verified by `/v1/auth/mini-app/:provider`. Signed launch data never comes from `initDataUnsafe`. MAX phone proofs are bound to the signed user ID. Telegram contacts are accepted only from the secret-protected webhook and the contact owner, with a five-minute request ID. Telegram polls only after an explicit contact request (at most five attempts); there is no idle login polling.

Embedded sessions use tab storage, separate from ordinary website login. A fresh messenger launch must verify its current identity before restoring passenger data. VK also validates the signed launch against a stored session before restoring it. Active orders remain on the server and are recovered through bootstrap after reopening.

The `057_mini_app_phone_challenges.sql` migration adds a table without changing released app contracts. Existing native/legacy bot-return links and conversational booking remain supported. A browser-origin login confirmation opens the corresponding mini app.

Telegram's menu is configured and read back by `server/scripts/configure-telegram-mini-app.ts` during deployment, after the service is healthy. MAX requires the mini-app URL and Open button in its business console; changes can require moderation. VK uses the existing application 54638428 and `/vk` entry.

Validation: mini-app auth, API routes, tab isolation, bot contacts and return buttons have unit tests. Production deployment probes reject unsigned MAX/Telegram launches with HTTP 401 and check all entry pages. Full order testing uses an isolated database; never create production taxi orders as smoke tests.

Official bridge/validation references:
- https://dev.max.ru/docs/webapps/bridge/
- https://dev.max.ru/docs/webapps/validation/
- https://core.telegram.org/bots/webapps
