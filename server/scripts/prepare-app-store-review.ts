import { mkdir, readFile, writeFile } from 'node:fs/promises';

import { PLAY_REVIEW_CODE, PLAY_REVIEW_PHONE } from '../play-review-auth';
import { checkStoreReviewAuth } from '../store-review-check';

const root = new URL('../../', import.meta.url);
const app = JSON.parse(await readFile(new URL('app.json', root), 'utf8'));
const checks = await checkStoreReviewAuth('https://api.taxigr.ru');
const verifiedAt = new Date().toISOString();
const notes = `Taxi Grahovo is a local taxi service in Grahovo, Udmurt Republic, Russia. The interface is in Russian.

TEST ACCOUNT (passenger, fully set up):
Phone: ${PLAY_REVIEW_PHONE}
Permanent verification code: ${PLAY_REVIEW_CODE}
No SMS delivery, external messenger account or payment is required for this test login.

1. Tap "Войти по SMS" (Sign in by SMS).
2. Review the terms and tap "Принять и продолжить" (Accept and continue).
3. Enter 9998887766; the +7 country code is already shown. Tap "Получить код по SMS" (Get SMS code).
4. Enter ${PLAY_REVIEW_CODE} and tap "Подтвердить код" (Confirm code).

Location and notification permissions are optional for passenger use. If location is declined or you are outside the service area, enter addresses in Grahovo manually. Select pickup and destination to view the route and fare. "Как можно скорее" means as soon as possible; "Заказать ко времени" opens the scheduled pickup date and time controls. Times are local Grahovo time (UTC+4).

The service is live: the final "Заказать" confirmation creates a real taxi request and may dispatch a real driver. Payments are for physical taxi rides and are made directly to the driver by cash or bank transfer. No digital goods, subscriptions or in-app purchases are sold.

The same app includes an optional driver area. Driver registration requires approval by the operator; the supplied review account is a passenger. Background location is used only for drivers during their working shift/active rides, not for passengers.

Account deletion is available in Profile > Settings > Delete account ("Удалить аккаунт"). It requires confirmation and cannot proceed while a ride is active. Historical trip/financial records and required legal records are retained as described in the privacy policy.

Production test login and session refresh verified: ${verifiedAt}.`;
const directory = new URL(`tmp/store-release-${app.expo.version}/`, root);
await mkdir(directory, { recursive: true });
await writeFile(new URL('ios-review-notes.txt', directory), notes + '\n');
await writeFile(new URL('ios-review.json', directory), JSON.stringify({
  appId: '6834034004', bundleId: 'ru.grahovo.taxi', version: app.expo.version,
  verifiedAt, checks, demoAccountName: PLAY_REVIEW_PHONE,
  demoAccountPassword: PLAY_REVIEW_CODE, demoAccountRequired: true, notes,
}, null, 2) + '\n');
console.log('Verified production App Store review login and generated English review notes.');
