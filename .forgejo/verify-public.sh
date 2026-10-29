#!/usr/bin/env bash
set -euo pipefail
npm run review:rustore
# Keep the verified release receipt usable when the developer's network cannot
# reach production directly. Never put the test login or session in CI logs.
node <<'NODE'
const fs = require('node:fs');
const { createHash } = require('node:crypto');
const { version } = require('./app.json').expo;
const review = JSON.parse(fs.readFileSync(`tmp/store-release-${version}/rustore-review.json`, 'utf8'));
const { versionCode, apiOrigin, verifiedAt, checks } = review;
console.log('STORE_REVIEW_VERIFIED ' + JSON.stringify({
  version, versionCode, apiOrigin, verifiedAt, checks,
  moderInfoSha256: createHash('sha256').update(review.moderInfo).digest('hex'),
}));
NODE
set -euo pipefail
curl --fail --silent --show-error --retry 8 --retry-all-errors --retry-delay 3 "https://${WEB_DOMAIN}/" >/dev/null
vk_page="$(curl --fail --silent --show-error --retry 8 --retry-all-errors --retry-delay 3 "https://${WEB_DOMAIN}/vk")"
grep -q 'Такси Грахово' <<<"$vk_page"
node scripts/verify-maplibre-deployment.cjs "https://${WEB_DOMAIN}"
health_response="$(curl --fail --silent --show-error --retry 8 --retry-all-errors --retry-delay 3 "https://${API_DOMAIN}/health/live")"
test "$(jq -r '.data.status' <<<"$health_response")" = "ok"
vk_mini_session_status="$(curl --silent --show-error --output /dev/null --write-out '%{http_code}' \
  -H 'Content-Type: application/json' \
  --data-binary '{"launchParams":"probe"}' \
  "https://${API_DOMAIN}/v1/auth/vk-mini/session")"
test "$vk_mini_session_status" = "401"
max_ca="$RUNNER_TEMP/russian-trusted-root-ca.pem"
curl --fail --silent --show-error --location \
  'https://gu-st.ru/content/lending/russian_trusted_root_ca_pem.crt' \
  --output "$max_ca"
test "$(openssl x509 -in "$max_ca" -noout -fingerprint -sha256 | cut -d= -f2 | tr -d ':' | tr '[:lower:]' '[:upper:]')" = \
  'D26D2D0231B7C39F92CC738512BA54103519E4405D68B5BD703E9788CA8ECF31'
max_subscription_payload="$(jq -cn \
  --arg url "https://${API_DOMAIN}/v1/webhooks/max" \
  --arg secret "$MAX_WEBHOOK_SECRET" \
  '{url:$url, update_types:["message_callback","bot_started","message_created"], secret:$secret}')"
curl --fail --silent --show-error \
  --retry 8 --retry-all-errors --retry-delay 3 \
  --cacert "$max_ca" \
  -H "Authorization: ${MAX_BOT_TOKEN}" \
  -H 'Content-Type: application/json' \
  --data-binary "$max_subscription_payload" \
  'https://platform-api2.max.ru/subscriptions' | jq -e '.success == true' >/dev/null
max_probe_response="$(curl --fail --silent --show-error \
  -H "X-Max-Bot-Api-Secret: ${MAX_WEBHOOK_SECRET}" \
  -H 'Content-Type: application/json' \
  --data-binary '{"update_type":"diagnostic_probe"}' \
  "https://${API_DOMAIN}/v1/webhooks/max")"
test "$(jq -r '.success' <<<"$max_probe_response")" = "true"
callback_payload="$(jq -cn \
  --arg group_id "$VK_COMMUNITY_ID" \
  --arg secret "$VK_CALLBACK_SECRET" \
  '{type:"confirmation", group_id:$group_id, secret:$secret}')"
callback_response="$(curl --fail --silent --show-error \
  --retry 8 --retry-all-errors --retry-delay 3 \
  -H 'Content-Type: application/json' \
  --data-binary "$callback_payload" \
  "https://${API_DOMAIN}/v1/webhooks/vk")"
test "$callback_response" = "$VK_CALLBACK_CONFIRMATION"
