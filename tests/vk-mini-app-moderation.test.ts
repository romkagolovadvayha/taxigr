import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = readFileSync(
  resolve(process.cwd(), 'src/screens/vk-mini-app-screen.tsx'),
  'utf8',
);

describe('VK Mini App moderation safeguards', () => {
  it('does not request community messages while handling phone permission', () => {
    const phoneFlow = source.slice(
      source.indexOf('const authorizeWithPhone'),
      source.indexOf('const finishAuthorization'),
    );

    expect(phoneFlow).not.toContain('allowVkCommunityMessages');
    expect(phoneFlow).toContain('setCommunityPermissionRequired(true)');
  });

  it('requests community messages only after an explicit choice in an explanatory modal', () => {
    const consentFlow = source.slice(
      source.indexOf('const finishAuthorization'),
      source.indexOf('useEffect(() =>'),
    );

    expect(consentFlow).toContain('requestCommunityMessages');
    expect(consentFlow).toContain('await allowVkCommunityMessages()');
    expect(source).toContain('Получать статусы поездок в VK?');
    expect(source).toContain('Разрешение не требуется для входа и заказа такси');
    expect(source).toContain('Разрешить сообщения');
    expect(source).toContain('Не сейчас');
  });
});
