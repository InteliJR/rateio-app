import { IsString, Matches } from 'class-validator';

export class PresignedUploadDto {
  @IsString()
  filename: string;

  @IsString()
  @Matches(/^image\/(jpeg|jpg|png|webp|gif)$/)
  mimeType: string;
}

export class AttachUploadedImageDto {
  @IsString()
  imageKey: string;
}
