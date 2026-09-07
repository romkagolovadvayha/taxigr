export type PushTokenSubscription = { remove: () => void };

export function isRuStorePushEnabled(): boolean {
  return false;
}

export async function getRuStorePushToken(): Promise<string | null> {
  throw new Error('RuStore Push is only available in the RuStore Android build.');
}

export function addRuStorePushTokenListener(
  _listener: (token: string) => void,
): PushTokenSubscription {
  return { remove: () => undefined };
}
