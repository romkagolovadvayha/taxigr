import { describe, expect, it } from 'vitest';
import { broadcastRunLabel, isBroadcastActive } from '../src/domain/vk-broadcasts';
import { VkApiError } from '../server/vk-bot';
import { decodeBroadcastImage, isVkUserId } from '../server/vk-broadcasts';
import { broadcastError, validateVkUploadUrl } from '../server/vk-broadcast-worker';

describe('broadcast safety contracts', () => {
  it('accepts only positive integer user identities', () => {
    for (const value of ['1','123456789',123]) expect(isVkUserId(value)).toBe(true);
    for (const value of ['-1','0','1e3','1;return 0',null,undefined,'9007199254740993']) expect(isVkUserId(value)).toBe(false);
  });
  it('accepts HTTPS VK upload servers without credentials, redirects or lookalike hosts', () => {
    expect(validateVkUploadUrl('https://pu.vk.com/upload').hostname).toBe('pu.vk.com');
    expect(validateVkUploadUrl('https://pu.userapi.com/upload').hostname).toBe('pu.userapi.com');
    for (const url of ['http://pu.vk.com/a','https://vk.com.evil.org/a','https://127.0.0.1/a','https://user:pass@vk.com/a','https://vk.com:444/a']) expect(()=>validateVkUploadUrl(url)).toThrow();
  });
  it('rejects invalid base64, HTML disguised as PNG, and oversized images', () => {
    expect(decodeBroadcastImage(null)).toBeNull();
    expect(()=>decodeBroadcastImage({mimeType:'image/png',base64:'not base64'})).toThrow();
    expect(()=>decodeBroadcastImage({mimeType:'image/png',base64:Buffer.from('<html>evil</html>').toString('base64')})).toThrow();
    const bytes=Buffer.alloc(2_500_001,255);expect(()=>decodeBroadcastImage({mimeType:'image/jpeg',base64:bytes.toString('base64')})).toThrow();
  });
  it('does not leak provider messages and distinguishes blocked recipients, temporary and global failures', () => {
    expect(broadcastError(new VkApiError(901,'private provider details'))).toMatchObject({retry:false,denied:true});
    expect(broadcastError(new VkApiError(936,'private provider details'))).toMatchObject({retry:false,denied:true});
    expect(broadcastError(new VkApiError(6,'private provider details'))).toMatchObject({retry:true,denied:false});
    expect(broadcastError(new VkApiError(9,'private provider details'))).toMatchObject({retry:false,denied:false});
    expect(broadcastError(new VkApiError(5,'private provider details')).message).not.toContain('private');
    expect(broadcastError(new Error('network timeout'))).toMatchObject({retry:true});
  });
  it('shows failed completions distinctly and only polls active sends', () => {
    expect(broadcastRunLabel({status:'completed',failed:1})).toBe('Завершена с ошибками');
    expect(isBroadcastActive('sending')).toBe(true);expect(isBroadcastActive('completed')).toBe(false);expect(isBroadcastActive('failed')).toBe(false);
  });
});
