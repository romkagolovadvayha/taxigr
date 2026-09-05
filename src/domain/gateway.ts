export type GatewaySettings = {
  proxyEnabled: boolean;
  proxyUrl: string;
  proxyUsername: string;
  webhooksEnabled: boolean;
  webhookUrl: string;
  project: string;
  apiPublicUrl: string;
};

export type GatewaySettingsView = GatewaySettings & {
  revision: number;
  hasProxyPassword: boolean;
  hasWebhookSecret: boolean;
};

export type TelegramWebhookStatus = {
  configured: boolean;
  matchesSettings: boolean;
  gateway: boolean;
  pendingUpdates: number;
  lastErrorAt: string | null;
  hasDeliveryError: boolean;
};

export const defaultGatewaySettings: GatewaySettingsView = {
  proxyEnabled: false,
  proxyUrl: 'https://proxy.prostoj.store:443',
  proxyUsername: '',
  webhooksEnabled: false,
  webhookUrl: 'https://hooks.prostoj.store/relay',
  project: '',
  apiPublicUrl: '',
  revision: 0,
  hasProxyPassword: false,
  hasWebhookSecret: false,
};
