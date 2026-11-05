import { IsOptional, IsPositive, IsString, Matches, Max } from 'class-validator';

export class PresignedUploadDto {
  @IsString()
  filename: string;

  @IsString()
  @Matches(/^image\/(jpeg|jpg|png|webp|gif)$/)
  mimeType: string;

  @IsOptional()
  @IsPositive()
  @Max(10 * 1024 * 1024)
  size?: number;
}

export class AttachUploadedImageDto {
  @IsString()
  imageKey: string;
}
