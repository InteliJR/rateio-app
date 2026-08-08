import {
  IsNotEmpty,
  IsUUID,
  IsNumber,
  IsPositive,
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
  Max,
} from 'class-validator';
import { FeeType } from '@prisma/client';
import {
  MAX_MONEY_DECIMAL_PLACES,
  MAX_MONEY_VALUE,
} from '../../common/numeric-limits';

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
  @IsNumber(
    { maxDecimalPlaces: MAX_MONEY_DECIMAL_PLACES },
    { message: 'O valor deve ter até 2 casas decimais' },
  )
  @IsPositive({ message: 'O valor deve ser positivo' })
  @Max(MAX_MONEY_VALUE, { message: 'O valor excede o limite permitido' })
  value: number;

  @IsOptional()
  @IsString({ message: 'A descrição deve ser uma string' })
  @MaxLength(255, { message: 'A descrição deve ter no máximo 255 caracteres' })
  description?: string;
}
