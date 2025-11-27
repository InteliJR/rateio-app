import {
  IsNumber,
  IsPositive,
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { FeeType } from '@prisma/client';

export class UpdateFeeDto {
  @IsOptional()
  @IsEnum(FeeType, {
    message:
      'Tipo de taxa inválido. Use: SERVICE_PERCENTAGE, SERVICE_FIXED ou COVER_CHARGE',
  })
  type?: FeeType;

  @IsOptional()
  @IsNumber({}, { message: 'O valor deve ser um número' })
  @IsPositive({ message: 'O valor deve ser positivo' })
  value?: number;

  @IsOptional()
  @IsString({ message: 'A descrição deve ser uma string' })
  @MaxLength(255, { message: 'A descrição deve ter no máximo 255 caracteres' })
  description?: string;
}
