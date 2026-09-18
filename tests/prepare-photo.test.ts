import { beforeEach, describe, expect, it, vi } from 'vitest';

import { preparePhoto } from '../src/utils/prepare-photo';

const mocks = vi.hoisted(() => ({
  loadAsync: vi.fn(), manipulate: vi.fn(), platform: { OS: 'android' },
}));
vi.mock('expo-image', () => ({ Image: { loadAsync: mocks.loadAsync } }));
vi.mock('expo-image-manipulator', () => ({
  ImageManipulator: { manipulate: mocks.manipulate }, SaveFormat: { JPEG: 'jpeg' },
}));
vi.mock('react-native', () => ({ Platform: mocks.platform }));

const photo = { uri: 'file:///camera.jpg', width: 8000, height: 6000 };
const steps = [{ maxDimension: 2048, compress: 0.8 }, { maxDimension: 1024, compress: 0.5 }];

function fixture() {
  const source = { width: 2048, height: 1536, release: vi.fn() };
  const bitmap = {
    saveAsync: vi.fn().mockResolvedValue({ uri: 'file:///small.jpg', width: 2048, height: 1536, base64: '/9j/AA==' }),
    release: vi.fn(),
  };
  const context = { reset: vi.fn(), resize: vi.fn(), renderAsync: vi.fn().mockResolvedValue(bitmap), release: vi.fn() };
  mocks.loadAsync.mockResolvedValue(source);
  mocks.manipulate.mockReturnValue(context);
  return { source, bitmap, context };
}

beforeEach(() => { vi.clearAllMocks(); mocks.platform.OS = 'android'; });

describe('bounded photo preparation', () => {
  it('decodes a camera original at upload size and releases all native references', async () => {
    const { source, bitmap, context } = fixture();
    const result = await preparePhoto(photo, steps, 100);
    expect(mocks.loadAsync).toHaveBeenCalledWith(photo.uri, { maxWidth: 2048, maxHeight: 2048 });
    expect(mocks.manipulate).toHaveBeenCalledWith(source);
    expect(result).toMatchObject({ mimeType: 'image/jpeg', sizeBytes: 4 });
    for (const ref of [source, bitmap, context]) expect(ref.release).toHaveBeenCalledOnce();
  });

  it('reuses the bounded source for retries instead of decoding the original again', async () => {
    const { bitmap, context } = fixture();
    bitmap.saveAsync.mockResolvedValueOnce({ base64: 'A'.repeat(400) });
    await preparePhoto(photo, steps, 100);
    expect(mocks.loadAsync).toHaveBeenCalledOnce();
    expect(mocks.manipulate).toHaveBeenCalledOnce();
    expect(context.reset).toHaveBeenCalledTimes(2);
    expect(context.resize).toHaveBeenCalledWith({ width: 1024 });
    expect(bitmap.release).toHaveBeenCalledTimes(2);
  });

  it('releases the bitmap and source when encoding fails', async () => {
    const { source, bitmap, context } = fixture();
    bitmap.saveAsync.mockRejectedValueOnce(new Error('encoding failed'));
    await expect(preparePhoto(photo, steps, 100)).rejects.toThrow('encoding failed');
    for (const ref of [source, bitmap, context]) expect(ref.release).toHaveBeenCalledOnce();
  });

  it('releases the source if creation of the manipulation context fails', async () => {
    const { source } = fixture();
    mocks.manipulate.mockImplementationOnce(() => { throw new Error('context failed'); });
    await expect(preparePhoto(photo, steps, 100)).rejects.toThrow('context failed');
    expect(source.release).toHaveBeenCalledOnce();
  });

  it('retains the web path with a URI and explicit resize', async () => {
    mocks.platform.OS = 'web';
    const { context } = fixture();
    await preparePhoto(photo, steps, 100);
    expect(mocks.loadAsync).not.toHaveBeenCalled();
    expect(mocks.manipulate).toHaveBeenCalledWith(photo.uri);
    expect(context.resize).toHaveBeenCalledWith({ width: 2048 });
  });

  it('rejects oversized output after all attempts and releases the context', async () => {
    const { source, bitmap, context } = fixture();
    bitmap.saveAsync.mockResolvedValue({ base64: 'A'.repeat(400) });
    await expect(preparePhoto(photo, steps, 100)).rejects.toThrow('допустимого размера');
    expect(bitmap.release).toHaveBeenCalledTimes(2);
    expect(source.release).toHaveBeenCalledOnce();
    expect(context.release).toHaveBeenCalledOnce();
  });
});
