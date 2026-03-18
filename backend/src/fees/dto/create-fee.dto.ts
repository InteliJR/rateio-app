import {
  IsNotEmpty,
  IsUUID,
  IsNumber,
  IsPositive,
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { FeeType } from '@prisma/client';

export class CreateFeeDto {
  @IsOptional()
  @IsUUID('4', { message: 'ID da conta inválido' })
  billId?: string;

  @IsNotEmpty({ message: 'O tipo de taxa é obrigatório' })
  @IsEnum(FeeType, {
    message:
      'Tipo de taxa inválido. Use: SERVICE_PERCENTAGE, SERVICE_FIXED ou COVER_CHARGE',
  })
  type: FeeType;

  @IsNotEmpty({ message: 'O valor da taxa é obrigatório' })
  @IsNumber({}, { message: 'O valor deve ser um número' })
  @IsPositive({ message: 'O valor deve ser positivo' })
  value: number;

  @IsOptional()
  @IsString({ message: 'A descrição deve ser uma string' })
  @MaxLength(255, { message: 'A descrição deve ter no máximo 255 caracteres' })
  description?: string;
}
