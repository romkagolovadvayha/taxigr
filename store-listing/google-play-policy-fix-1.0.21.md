# Google Play review: 1.0.21 (41)

Addresses the September 21, 2026 rejection for privacy policy labeling and location disclosure.

- Public privacy policy: https://taxigr.ru/privacy. The prominent heading is “Политика конфиденциальности / Privacy Policy”. It identifies Такси Грахово (ru.grahovo.taxi), developer Roman Mescheryakov, privacy contact, data uses, recipients, retention and deletion.
- In-app link: Profile → Settings → “Политика конфиденциальности”.
- Pickup: use the current-location action. Before system permission or position access, a separate disclosure explains precise location, address lookup and recipients. “Разрешить” is required; “Не разрешать” and dismissal deny access. The address remains editable manually.
- Passenger sharing: Profile → Settings → “Показывать водителю, где я”. It is OFF on fresh install and on upgrade from previous versions. Enabling it shows a dedicated disclosure with recipient, purpose, active-order/foreground limits and how to stop. No coordinates are shared before acceptance and OS permission.
- Driver: going online requests a driver-specific foreground disclosure. Background location has a separate disclosure that explicitly says collection continues when the app is closed or not in use, restricted to online status or an active trip. Background refusal retains foreground-only operation. Existing OS permissions do not bypass consent; old background tasks stop if the new consent receipt is absent.
- The APK permissions are retained because driver background location remains an actual feature.

Verification results and the signed artifact are recorded in tmp/store-release-1.0.21/.
