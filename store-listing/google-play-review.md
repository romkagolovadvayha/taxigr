# Google Play review access

Credential name: **Passenger review account**

- Phone: `+7 999 888-77-66`
- Permanent verification code: `4455`

Instructions:

1. Tap **«Войти по SMS»** (Sign in by SMS).
2. Tap **«Принять и продолжить»** (Accept and continue).
3. Enter `9998887766`; the country code `+7` is already displayed.
4. Tap **«Получить код по SMS»** (Get code).
5. Enter `4455` and tap **«Подтвердить код»** (Confirm code).

The code is permanent and reusable; no SMS, external messenger, payment, subscription, or location restriction is required. The account has passenger-only access. Reviewers can select addresses, calculate a fare, and inspect the order confirmation flow. Please do not submit a real ride order.

## Release notes 1.0.12

- Prepared Android WebView asynchronously before mounting the map, with a local placeholder, loading indicator and retry action.
- Fixed driver-to-passenger ratings after trip completion, including a queued next ride.
- Added spoken fare-increase and app-update prompts, and profile avatars in navigation.

- Added one-time update prompts and a persistent update action in passenger and driver profiles.
- Updates open the store used to install the app; prompts wait until no ride is active.

- Updated the yellow identity, compact illustrated fares, and light/dark themes.
- Introduced provider-first sign-in and a separate SMS flow.
- Added natural Russian voice notifications for ride states.
- Improved road routes, address resolution, concurrent orders, and driver queues.
- Refreshed the store icon, feature graphic, and six promotional screenshot cards.

Production reviewer sign-in and session refresh were verified on 9 September 2026.
This release targets the existing closed Alpha test; production access still requires completion of Google's testing requirements.
