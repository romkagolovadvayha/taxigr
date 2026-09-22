// Release builds must never enable demo accounts, even with a stale build variable.
export const demoEnabled = typeof __DEV__ !== 'undefined' && __DEV__ &&
  process.env.EXPO_PUBLIC_DEMO_MODE === 'true';
