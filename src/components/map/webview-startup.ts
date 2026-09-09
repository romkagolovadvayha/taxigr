import { Platform } from 'react-native';
import WebViewStartup from '../../../modules/taxigr-webview-startup';

let startup: Promise<void> | undefined;

export function prepareMapWebView(): Promise<void> {
  // Expo Go/iOS have no custom Android module. Store builds autolink it.
  if (Platform.OS !== 'android' || !WebViewStartup) return Promise.resolve();
  // Multiple maps and Strict Mode share one operation. Keep failures too:
  // Android advises against creating a WebView after native startup fails.
  startup ??= WebViewStartup.prepare();
  return startup;
}
