export type VkMiniAppSessionHandoff = {
  remember: (launchParams: string) => void;
  consume: (launchParams: string) => boolean;
  clear: () => void;
};

export function createVkMiniAppSessionHandoff(): VkMiniAppSessionHandoff {
  let verifiedLaunchParams: string | null = null;

  return {
    remember(launchParams) {
      verifiedLaunchParams = launchParams;
    },
    consume(launchParams) {
      const verified = verifiedLaunchParams === launchParams;
      verifiedLaunchParams = null;
      return verified;
    },
    clear() {
      verifiedLaunchParams = null;
    },
  };
}
