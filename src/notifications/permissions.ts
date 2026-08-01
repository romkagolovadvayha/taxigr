// TypeScript fallback. Metro selects the platform-specific implementation.
export async function hasNotificationPermission(): Promise<boolean> {
  return false;
}

export async function requestNotificationPermission(): Promise<boolean> {
  return false;
}
