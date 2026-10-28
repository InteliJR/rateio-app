import { BadRequestException } from '@nestjs/common';

export interface DetectedImage {
  mimeType: string;
  extension: string;
}

/**
 * Detecta a assinatura binária (magic bytes) de arquivos de imagem
 */
export function detectImageSignature(buffer: Buffer): DetectedImage | null {
  if (!buffer || !Buffer.isBuffer(buffer) || buffer.length < 12) {
    return null;
  }

  // JPEG: FF D8 FF
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return { mimeType: 'image/jpeg', extension: 'jpg' };
  }

  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a
  ) {
    return { mimeType: 'image/png', extension: 'png' };
  }

  // GIF: GIF87a ou GIF89a (47 49 46 38 37/39 61)
  if (
    buffer[0] === 0x47 &&
    buffer[1] === 0x49 &&
    buffer[2] === 0x46 &&
    buffer[3] === 0x38 &&
    (buffer[4] === 0x37 || buffer[4] === 0x39) &&
    buffer[5] === 0x61
  ) {
    return { mimeType: 'image/gif', extension: 'gif' };
  }

  // WebP: RIFF????WEBP (52 49 46 46 .... 57 45 42 50)
  if (
    buffer[0] === 0x52 &&
    buffer[1] === 0x49 &&
    buffer[2] === 0x46 &&
    buffer[3] === 0x46 &&
    buffer[8] === 0x57 &&
    buffer[9] === 0x45 &&
    buffer[10] === 0x42 &&
    buffer[11] === 0x50
  ) {
    return { mimeType: 'image/webp', extension: 'webp' };
  }

  return null;
}

/**
 * Valida os magic bytes do buffer e lança BadRequestException caso inválido
 */
export function assertImageSignature(buffer: Buffer): DetectedImage {
  const detected = detectImageSignature(buffer);

  if (!detected) {
    throw new BadRequestException(
      'Assinatura do arquivo inválida. Apenas imagens reais JPEG, PNG, WebP e GIF são permitidas.',
    );
  }

  return detected;
}

