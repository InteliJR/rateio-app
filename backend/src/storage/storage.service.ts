import { Injectable, InternalServerErrorException } from '@nestjs/common';
import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { v4 as uuidv4 } from 'uuid';

@Injectable()
export class StorageService {
  private s3Client: S3Client;
  private bucketName: string;

  constructor() {
    this.bucketName = process.env.AWS_S3_BUCKET || '';
    
    this.s3Client = new S3Client({
      region: process.env.AWS_S3_REGION || 'us-east-1',
      credentials: {
        accessKeyId: process.env.AWS_S3_ACCESS_KEY || '',
        secretAccessKey: process.env.AWS_S3_SECRET_KEY || '',
      },
    });
  }

  /**
   * Upload de arquivo para S3
   */
  async uploadFile(
    file: Express.Multer.File,
    folder: string = 'bills',
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

      // Gerar URL pré-assinada (válida por 1 hora)
      const url = await this.getSignedUrl(key);

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

  /**
   * Deletar arquivo do S3
   */
  async deleteFile(key: string): Promise<void> {
    try {
      const command = new DeleteObjectCommand({
        Bucket: this.bucketName,
        Key: key,
      });

      await this.s3Client.send(command);
    } catch (error) {
      console.error('⚠️ Erro ao deletar arquivo:', error);
      // Não lançar erro - arquivo pode já ter sido deletado
    }
  }

  /**
   * Validar tipo de arquivo (apenas imagens)
   */
  validateFileType(mimetype: string): boolean {
    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
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