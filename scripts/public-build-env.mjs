/** Copy only explicitly public build settings; server secrets never enter this map. */
export function publicBuildEnvironment(production, current) {
  const result = {};
  for (const values of [production, current]) {
    for (const [key, value] of Object.entries(values)) {
      if (key.startsWith('EXPO_PUBLIC_') && value !== undefined) result[key] = value;
    }
  }
  for (const provider of ['VK', 'MAX']) {
    const prefix = `EXPO_PUBLIC_${provider}_RELAY_`;
    if (result[prefix + 'ENABLED'] !== '1') continue;
    for (const suffix of ['CHANNEL', 'PUBLIC_KEY', 'BOT_TOKEN', provider === 'VK' ? 'GROUP_ID' : 'CHAT_ID', 'SERVICE_USER_ID']) {
      if (!result[prefix + suffix]) throw new Error(`Missing public relay build setting: ${prefix + suffix}`);
    }
    if (result[prefix + 'GATEWAY_URL']) throw new Error('Production relay builds must use direct provider APIs.');
  }
  return result;
}
