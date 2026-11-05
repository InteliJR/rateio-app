import { BadRequestException } from '@nestjs/common';
import { detectImageSignature, assertImageSignature } from './file-signature';

describe('file-signature', () => {
  it('deve identificar imagem JPEG válida', () => {
    const jpegBuffer = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01]);
    const result = detectImageSignature(jpegBuffer);

    expect(result).toEqual({ mimeType: 'image/jpeg', extension: 'jpg' });
  });

  it('deve identificar imagem PNG válida', () => {
    const pngBuffer = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d]);
    const result = detectImageSignature(pngBuffer);

    expect(result).toEqual({ mimeType: 'image/png', extension: 'png' });
  });

  it('deve identificar imagem GIF válida', () => {
    const gifBuffer = Buffer.from([0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 0x01, 0x00, 0x01, 0x00, 0x80, 0x00]);
    const result = detectImageSignature(gifBuffer);

    expect(result).toEqual({ mimeType: 'image/gif', extension: 'gif' });
  });

  it('deve identificar imagem WebP válida', () => {
    const webpBuffer = Buffer.from([
      0x52, 0x49, 0x46, 0x46, 0x24, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50,
    ]);
    const result = detectImageSignature(webpBuffer);

    expect(result).toEqual({ mimeType: 'image/webp', extension: 'webp' });
  });

  it('deve rejeitar arquivo HTML disfarçado de imagem', () => {
    const fakeHtml = Buffer.from('<html><script>alert(1)</script></html>');

    expect(detectImageSignature(fakeHtml)).toBeNull();
    expect(() => assertImageSignature(fakeHtml)).toThrow(BadRequestException);
  });

  it('deve rejeitar buffers curtos ou nulos', () => {
    expect(detectImageSignature(Buffer.from([0x01, 0x02]))).toBeNull();
    expect(() => assertImageSignature(null as any)).toThrow(BadRequestException);
  });
});

