export type VkMiniAppProfileIdentity = {
  launchParams: string;
  profile: {
    id: number;
    firstName: string | null;
    lastName: string | null;
    avatarUrl: string | null;
  };
};

export type VkMiniAppPhoneIdentity = {
  phoneNumber: string;
  phoneSign: string;
  phoneVerified: true;
};

export type VkMiniAppIdentity = VkMiniAppProfileIdentity & VkMiniAppPhoneIdentity;

export class VkMiniAppBridgeError extends Error {
  constructor(
    message: string,
    public readonly code: 'NOT_EMBEDDED' | 'PHONE_NOT_SHARED' | 'BRIDGE_FAILED',
  ) {
    super(message);
    this.name = 'VkMiniAppBridgeError';
  }
}

export async function initializeVkMiniApp(): Promise<void> {
  throw new VkMiniAppBridgeError(
    'VK Mini Apps доступно только в веб-версии ВКонтакте.',
    'NOT_EMBEDDED',
  );
}

export function getVkMiniAppLaunchParams(): string {
  return '';
}

export async function requestVkMiniAppIdentity(): Promise<VkMiniAppIdentity> {
  throw new VkMiniAppBridgeError(
    'VK Mini Apps доступно только в веб-версии ВКонтакте.',
    'NOT_EMBEDDED',
  );
}

export async function requestVkMiniAppProfile(): Promise<VkMiniAppProfileIdentity> {
  throw new VkMiniAppBridgeError(
    'VK Mini Apps доступно только в веб-версии ВКонтакте.',
    'NOT_EMBEDDED',
  );
}

export async function requestVkMiniAppPhone(): Promise<VkMiniAppPhoneIdentity> {
  throw new VkMiniAppBridgeError(
    'VK Mini Apps доступно только в веб-версии ВКонтакте.',
    'NOT_EMBEDDED',
  );
}

export async function allowVkCommunityMessages(): Promise<boolean> {
  return false;
}
