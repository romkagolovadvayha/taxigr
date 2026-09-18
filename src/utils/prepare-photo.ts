import { Image } from 'expo-image';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { Platform } from 'react-native';

import { base64ByteLength, imageResizeToFit } from './image-data';

type Photo = { uri: string; width: number; height: number };
type Step = { maxDimension: number; compress: number };

// Decode through Glide/SDWebImage at the upload size, not at the camera's full
// resolution. Every retry reuses that bounded source and releases its bitmap.
export async function preparePhoto(photo: Photo, steps: readonly Step[], maxBytes: number) {
  const firstStep = steps[0];
  if (!firstStep) throw new Error('Не заданы параметры обработки фотографии');
  const source = Platform.OS === 'web' ? null : await Image.loadAsync(photo.uri, {
    maxWidth: firstStep.maxDimension,
    maxHeight: firstStep.maxDimension,
  });
  let context: ReturnType<typeof ImageManipulator.manipulate> | undefined;
  try {
    context = ImageManipulator.manipulate(source ?? photo.uri);
    for (const step of steps) {
      context.reset();
      const resize = imageResizeToFit(
        source?.width ?? photo.width, source?.height ?? photo.height, step.maxDimension,
      );
      if (resize) context.resize(resize);
      const rendered = await context.renderAsync();
      try {
        const optimized = await rendered.saveAsync({
          base64: true,
          compress: step.compress,
          format: SaveFormat.JPEG,
        });
        if (!optimized.base64) continue;
        const sizeBytes = base64ByteLength(optimized.base64);
        if (sizeBytes <= maxBytes) {
          return { ...optimized, base64: optimized.base64, mimeType: 'image/jpeg' as const, sizeBytes };
        }
      } finally {
        rendered.release();
      }
    }
    throw new Error('Не удалось уменьшить фотографию до допустимого размера');
  } finally {
    context?.release();
    source?.release();
  }
}
