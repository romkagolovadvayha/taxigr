import bridge from '@vkontakte/vk-bridge';

export type VkMiniAppIdentity = {
  launchParams: string;
  phoneNumber: string;
  phoneSign: string;
  phoneVerified: true;
  profile: {
    id: number;
    firstName: string | null;
    lastName: string | null;
    avatarUrl: string | null;
  };
};

export class VkMiniAppBridgeError extends Error {
  constructor(
    message: string,
    public readonly code: 'NOT_EMBEDDED' | 'PHONE_NOT_SHARED' | 'BRIDGE_FAILED',
  ) {
    super(message);
    this.name = 'VkMiniAppBridgeError';
  }
}

export function getVkMiniAppLaunchParams(): string {
  if (typeof window === 'undefined') return '';
  const current = new URLSearchParams(window.location.search);
  const launch = new URLSearchParams();
  for (const [key, value] of current.entries()) {
    if (key === 'sign' || key.startsWith('vk_')) launch.append(key, value);
  }
  return launch.toString();
}

export async function initializeVkMiniApp(): Promise<void> {
  if (!bridge.isEmbedded()) {
    throw new VkMiniAppBridgeError(
      'Откройте «Такси Грахово» внутри ВКонтакте.',
      'NOT_EMBEDDED',
    );
  }
  try {
    await bridge.send('VKWebAppInit');
  } catch {
    throw new VkMiniAppBridgeError('Не удалось подключиться к ВКонтакте.', 'BRIDGE_FAILED');
  }
}

export async function requestVkMiniAppIdentity(): Promise<VkMiniAppIdentity> {
  try {
    const [launch, profile] = await Promise.all([
      bridge.send('VKWebAppGetLaunchParams'),
      bridge.send('VKWebAppGetUserInfo'),
    ]);
    const phone = await bridge.send('VKWebAppGetPhoneNumber');
    if (!phone.phone_number || !phone.sign || !phone.is_verified) {
      throw new VkMiniAppBridgeError(
        'Подтвердите передачу номера телефона в окне VK.',
        'PHONE_NOT_SHARED',
      );
    }
    if (launch.vk_user_id !== profile.id) {
      throw new VkMiniAppBridgeError('VK вернул разные профили пользователя.', 'BRIDGE_FAILED');
    }
    const launchParams = getVkMiniAppLaunchParams();
    if (!launchParams) {
      throw new VkMiniAppBridgeError('Параметры запуска VK отсутствуют.', 'BRIDGE_FAILED');
    }
    return {
      launchParams,
      phoneNumber: phone.phone_number,
      phoneSign: phone.sign,
      phoneVerified: true,
      profile: {
        id: profile.id,
        firstName: profile.first_name?.trim() || null,
        lastName: profile.last_name?.trim() || null,
        avatarUrl: profile.photo_200?.trim() || profile.photo_100?.trim() || null,
      },
    };
  } catch (error) {
    if (error instanceof VkMiniAppBridgeError) throw error;
    throw new VkMiniAppBridgeError(
      'VK не передал данные для входа. Попробуйте ещё раз.',
      'PHONE_NOT_SHARED',
    );
  }
}

export async function allowVkCommunityMessages(): Promise<boolean> {
  const communityId = Number(process.env.EXPO_PUBLIC_VK_COMMUNITY_ID);
  if (!Number.isSafeInteger(communityId) || communityId <= 0) return false;
  try {
    const result = await bridge.send('VKWebAppAllowMessagesFromGroup', {
      group_id: communityId,
    });
    return result.result === true;
  } catch {
    return false;
  }
}
