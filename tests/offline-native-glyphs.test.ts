import { afterEach, describe, expect, it, vi } from 'vitest';
const fs=vi.hoisted(()=>({makeDirectoryAsync:vi.fn(),getInfoAsync:vi.fn(),writeAsStringAsync:vi.fn()}));
vi.mock('expo-file-system/legacy',()=>({...fs,documentDirectory:'file:///app/documents/',EncodingType:{Base64:'base64'}}));
afterEach(()=>{vi.resetModules();vi.clearAllMocks();});
describe('native offline fonts on Android and iOS',()=>{
  it('extracts every bundled glyph block locally on first start and shares concurrent extraction',async()=>{
    fs.getInfoAsync.mockResolvedValue({exists:false});
    const {prepareBundledGlyphs}=await import('../src/offline/map-glyphs.native');
    const [first,second]=await Promise.all([prepareBundledGlyphs(),prepareBundledGlyphs()]);
    expect(first).toBe(second);expect(first).toMatch(/^file:\/\/\/app\/documents\/offline-map-[a-f0-9]+\/fonts\/\{fontstack\}\/\{range\}.pbf$/);
    expect(fs.writeAsStringAsync).toHaveBeenCalledTimes(3);
    for (const [path,bytes,options] of fs.writeAsStringAsync.mock.calls) {
      expect(path).toMatch(/Noto Sans Regular\/(0-255|1024-1279|8192-8447)\.pbf$/);
      expect(Buffer.from(bytes,'base64').byteLength).toBeGreaterThan(100);
      expect(options).toEqual({encoding:'base64'});
    }
  });
  it('can retry extraction after a local disk failure',async()=>{
    fs.getInfoAsync.mockResolvedValue({exists:false});
    fs.makeDirectoryAsync.mockRejectedValueOnce(new Error('Disk unavailable')).mockResolvedValue(undefined);
    const {prepareBundledGlyphs}=await import('../src/offline/map-glyphs.native');
    await expect(prepareBundledGlyphs()).rejects.toThrow('Disk unavailable');
    await expect(prepareBundledGlyphs()).resolves.toMatch(/^file:/);
  });
});
