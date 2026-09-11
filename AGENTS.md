# Expo HAS CHANGED

Read the exact versioned docs at https://docs.expo.dev/versions/v57.0.0/ before writing any code.

## RuStore publishing preference

The user has already provided RuStore API access. Prefer the API for uploads, submission and status checks. Do not ask for the token again or start with browser uploads when the API can do the operation.

- Existing credentials are in `credentials/rustore/key-id.txt` and `credentials/rustore/private-key.key`. Use them in process to obtain a fresh Public-Token; never print or copy their values into source, logs or messages.
- The local `tmp/store-api.cjs` helper authenticates with those credentials. Release receipts and verified artifacts are under `tmp/store-release-<version>/`.
- Distinguish authentication errors from RuStore validation errors. A browser failure does not mean the API is unavailable.
- Before retrying a failed upload, inspect its response and the current version status. Do not blindly upload the same rejected file or create duplicate drafts.
- RuStore documents a console-only declaration step for `APK/AAB contains new sensitive permissions`. If that exact restriction applies, use the authenticated console to upload and complete the actual declaration, then use the API for submission and verification where supported. Do not stop at reporting this validation error, claim the token is missing, strip needed permissions, or report an unsubmitted version as submitted.
- Verified history: 1.0.10 (29) was uploaded and committed through the Public API; 1.0.11 (31) and 1.0.12 (32) were submitted through the authenticated developer console. Reuse the existing draft and verified signed artifact when continuing an interrupted release.
- On the RuStore Files step, direct clicks on the hidden `input[type="file"]` / `Choose File` timed out before opening a chooser. The working control is the visible region named `Выберите файлы или перетащите их сюда APK или AAB не более 5 GB`: arm `playwright.waitForEvent('filechooser', { timeoutMs: 10000 })`, click that region, await the chooser, then call `chooser.setFiles([absoluteApkPath])`. This successfully started the 1.0.13 (33) upload on 2026-09-11. A chooser timeout alone does not establish that local-file access is disabled; try the visible upload control before asking the user to change extension settings. Use only supported browser tools.
- The console fallback was completed for 1.0.13 (33), version ID 2064817501: upload through the visible region, wait for processing, declare sensitive permissions, verify actual collected data, continue through information/media/publication, and click `Отправить на модерацию`. Saving a console draft alone left the Public API commit returning `Packages for version ... not found`; finish such drafts in the console instead of repeating API commit or re-uploading. The API then returned the actual version code and `AUTO_CHECK`, and the console showed `Ожидает модерацию`.
- The technical form may auto-add video, audio files and documents from broad image-picker manifest permissions whenever reopened. Check actual code and remove categories the app does not collect before continuing to final submission; do not alter APK permissions to bypass review. The current app accepts photographs, not those other file categories. Preserve the sensitive-permission justification, current listing and six screenshots.
- Official publishing API: https://www.rustore.ru/help/work-with-rustore-api/api-upload-publication-app
- Permission validation: https://www.rustore.ru/help/work-with-rustore-api/api-upload-publication-app/apk-file-upload
