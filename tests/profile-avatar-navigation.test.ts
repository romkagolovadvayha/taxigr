import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const orderScreen = readFileSync(
  resolve(process.cwd(), 'src/screens/passenger/order-screen.tsx'),
  'utf8',
);
const roleNavigation = readFileSync(
  resolve(process.cwd(), 'src/components/role-navigation.tsx'),
  'utf8',
);

describe('profile avatar navigation', () => {
  it('shows the session avatar in the passenger header profile button', () => {
    expect(orderScreen).toContain('accessibilityLabel="Открыть профиль"');
    expect(orderScreen).toContain('avatarUrl={user?.avatarUrl}');
    expect(orderScreen).not.toContain("user?.name.split(' ')");
  });

  it('shows the session avatar for profile items in mobile and desktop role navigation', () => {
    expect(roleNavigation.match(/item\.icon === 'profile'/gu)).toHaveLength(2);
    expect(roleNavigation.match(/avatarUrl=\{user\?\.avatarUrl\}/gu)).toHaveLength(2);
    expect(roleNavigation.match(/accessible=\{false\}/gu)).toHaveLength(2);
  });
});
