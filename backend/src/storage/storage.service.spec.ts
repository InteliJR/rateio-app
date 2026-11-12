import { StorageService } from './storage.service';

describe('StorageService', () => {
  let service: StorageService;

  beforeEach(() => {
    service = new StorageService();
  });

  describe('createObjectKey', () => {
    it('deve derivar a extensão estritamente do mimetype e ignorar extensão do filename', () => {
      const keyHtml = service.createObjectKey(
        'bills',
        'user-123',
        'malicious.html',
        'image/png',
      );
      expect(keyHtml).toMatch(/^bills\/user-123\/[a-f0-9-]+\.png$/);
      expect(keyHtml).not.toContain('.html');

      const keyPhp = service.createObjectKey(
        'avatars',
        'user-456',
        'script.php',
        'image/jpeg',
      );
      expect(keyPhp).toMatch(/^avatars\/user-456\/[a-f0-9-]+\.jpg$/);
      expect(keyPhp).not.toContain('.php');

      const keyWebp = service.createObjectKey(
        'bills',
        'user-789',
        'receipt.exe',
        'image/webp',
      );
      expect(keyWebp).toMatch(/^bills\/user-789\/[a-f0-9-]+\.webp$/);
      expect(keyWebp).not.toContain('.exe');
    });
  });
});

