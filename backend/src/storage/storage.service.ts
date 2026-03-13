import { Injectable, InternalServerErrorException } from '@nestjs/common';
import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { v4 as uuidv4 } from 'uuid';
import { diskStorage, memoryStorage } from 'multer';
import { extname } from 'path';
import * as fs from 'fs';
import * as path from 'path';

@Injectable()
export class StorageService {
  private s3Client: S3Client;
  private bucketName: string;
  private readonly uploadRoot = './uploads';
  private readonly avatarUploadPath = './uploads/avatars';
  private useS3: boolean;
  private readonly isServerlessEnv: boolean;
  private readonly publicBaseUrl: string;
  private readonly s3PublicBaseUrl: string;

  constructor() {
    this.bucketName = process.env.AWS_S3_BUCKET || '';
    this.publicBaseUrl = (process.env.PUBLIC_BASE_URL || '').replace(/\/$/, '');
    this.s3PublicBaseUrl = (process.env.AWS_S3_PUBLIC_BASE_URL || '').replace(/\/$/, '');
    this.isServerlessEnv = process.env.NODE_ENV === 'production' || !!process.env.VERCEL;
    this.useS3 = !!this.bucketName; // Usa S3 se bucket estiver configurado

    if (this.isServerlessEnv && !this.useS3) {
      throw new Error(
        'Storage local nao e suportado neste ambiente. Configure AWS_S3_BUCKET e credenciais S3 para deploy.',
      );
    }

    if (this.useS3) {
      this.s3Client = new S3Client({
        region: process.env.AWS_S3_REGION || 'us-east-1',
        credentials: {
          accessKeyId: process.env.AWS_S3_ACCESS_KEY || '',
          secretAccessKey: process.env.AWS_S3_SECRET_KEY || '',
        },
      });
    } else {
      // Garante que pasta local existe
      if (!fs.existsSync(this.avatarUploadPath)) {
        fs.mkdirSync(this.avatarUploadPath, { recursive: true });
      }
    }
  }

  isUsingS3(): boolean {
    return this.useS3;
  }

  shouldServeLocalUploads(): boolean {
    return !this.useS3 && !this.isServerlessEnv;
  }

  /**
   * Configurações do Multer para upload local
   */
  getMulterOptions() {
    return {
      storage: this.useS3
        ? memoryStorage()
        : diskStorage({
            destination: this.avatarUploadPath,
            filename: (req, file, callback) => {
              const randomName = Array(32)
                .fill(null)
                .map(() => Math.round(Math.random() * 16).toString(16))
                .join('');
              const ext = extname(file.originalname);
              callback(null, `${randomName}${ext}`);
            },
          }),
      fileFilter: (req, file, callback) => {
        if (!file.mimetype.match(/\/(jpg|jpeg|png|gif|webp)$/)) {
          return callback(
            new Error('Apenas arquivos de imagem são permitidos!'),
            false,
          );
        }
        callback(null, true);
      },
      limits: {
        fileSize: 5 * 1024 * 1024, // 5MB
      },
    };
  }

  /**
   * Upload de arquivo (S3 ou local conforme configuração)
   */
  async uploadFile(
    file: Express.Multer.File,
    folder: string = 'bills',
  ): Promise<{ key: string; url: string }> {
    if (this.useS3) {
      return this.uploadToS3(file, folder);
    } else {
      const folderPath = path.join(this.uploadRoot, folder);
      if (!fs.existsSync(folderPath)) {
        fs.mkdirSync(folderPath, { recursive: true });
      }

      const filename = file.filename || `${uuidv4()}.${file.originalname.split('.').pop()}`;
      const filePath = path.join(folderPath, filename);

      if (file.buffer && !file.filename) {
        fs.writeFileSync(filePath, file.buffer);
      }

      const relativeUrl = `/uploads/${folder}/${filename}`;
      return {
        key: `${folder}/${filename}`,
        url: this.publicBaseUrl ? `${this.publicBaseUrl}${relativeUrl}` : relativeUrl,
      };
    }
  }

  /**
   * Upload para S3
   */
  private async uploadToS3(
    file: Express.Multer.File,
    folder: string,
  ): Promise<{ key: string; url: string }> {
    try {
      const fileExtension = file.originalname.split('.').pop();
      const key = `${folder}/${uuidv4()}.${fileExtension}`;

      const command = new PutObjectCommand({
        Bucket: this.bucketName,
        Key: key,
        Body: file.buffer,
        ContentType: file.mimetype,
      });

      await this.s3Client.send(command);

      const url = await this.resolveS3Url(key);

      return { key, url };
    } catch (error) {
      console.error('❌ Erro no upload S3:', error);
      throw new InternalServerErrorException('Falha ao fazer upload da imagem');
    }
  }

  /**
   * Gerar URL pré-assinada (válida por 1 hora)
   */
  async getSignedUrl(key: string, expiresIn: number = 3600): Promise<string> {
    if (!this.useS3) {
      const relativeUrl = `/uploads/${key}`;
      return this.publicBaseUrl ? `${this.publicBaseUrl}${relativeUrl}` : relativeUrl;
    }

    try {
      const command = new GetObjectCommand({
        Bucket: this.bucketName,
        Key: key,
      });

      return await getSignedUrl(this.s3Client, command, { expiresIn });
    } catch (error) {
      console.error('❌ Erro ao gerar URL:', error);
      throw new InternalServerErrorException('Falha ao gerar URL da imagem');
    }
  }

  private async resolveS3Url(key: string): Promise<string> {
    if (this.s3PublicBaseUrl) {
      return `${this.s3PublicBaseUrl}/${key}`;
    }

    return this.getSignedUrl(key);
  }

  /**
   * Deletar arquivo (S3 ou local)
   */
  async deleteFile(key: string): Promise<void> {
    if (this.useS3) {
      await this.deleteFromS3(key);
    } else {
      await this.deleteLocalFile(key);
    }
  }

  /**
   * Deletar do S3
   */
  private async deleteFromS3(key: string): Promise<void> {
    try {
      const command = new DeleteObjectCommand({
        Bucket: this.bucketName,
        Key: key,
      });

      await this.s3Client.send(command);
    } catch (error) {
      console.error('⚠️ Erro ao deletar arquivo do S3:', error);
    }
  }

  /**
   * Deletar arquivo local
   */
  async deleteLocalFile(filename: string): Promise<void> {
    try {
      const filePath = filename.includes('/')
        ? path.join(this.uploadRoot, filename)
        : path.join(this.avatarUploadPath, filename);
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    } catch (error) {
      console.error('⚠️ Erro ao deletar arquivo local:', error);
    }
  }

  extractStorageKeyFromUrl(url: string | null | undefined): string | null {
    if (!url) {
      return null;
    }

    const localPrefix = '/uploads/';
    if (url.startsWith(localPrefix)) {
      return url.slice(localPrefix.length);
    }

    if (this.publicBaseUrl && url.startsWith(`${this.publicBaseUrl}${localPrefix}`)) {
      return url.slice(`${this.publicBaseUrl}${localPrefix}`.length);
    }

    if (this.s3PublicBaseUrl && url.startsWith(`${this.s3PublicBaseUrl}/`)) {
      return url.slice(`${this.s3PublicBaseUrl}/`.length);
    }

    try {
      const parsed = new URL(url);
      const pathname = parsed.pathname.replace(/^\//, '');
      if (pathname.includes('/')) {
        return pathname;
      }
      return null;
    } catch {
      return null;
    }
  }

  /**
   * Validar tipo de arquivo (apenas imagens)
   */
  validateFileType(mimetype: string): boolean {
    const allowedTypes = [
      'image/jpeg',
      'image/jpg',
      'image/png',
      'image/webp',
      'image/gif',
    ];
    return allowedTypes.includes(mimetype);
  }

  /**
   * Validar tamanho de arquivo (máx 10MB)
   */
  validateFileSize(size: number): boolean {
    const maxSize = 10 * 1024 * 1024; // 10MB
    return size <= maxSize;
  }
}
