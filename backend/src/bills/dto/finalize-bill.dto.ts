import {
  IsArray,
  IsNotEmpty,
  IsUUID,
  IsNumber,
  IsPositive,
  IsEnum,
  IsOptional,
  IsString,
  ValidateNested,
  Max,
} from 'class-validator';
import { Type } from 'class-transformer';
import { FeeType } from '@prisma/client';
import {
  MAX_MONEY_DECIMAL_PLACES,
  MAX_MONEY_VALUE,
} from '../../common/numeric-limits';

/**
 * DTO para uma divisão na finalização
 */
export class FinalizeDivisionDto {
  @IsNotEmpty({ message: 'O ID do item é obrigatório' })
  @IsUUID('4', { message: 'ID do item inválido' })
  billItemId: string;

  @IsNotEmpty({ message: 'O ID do participante é obrigatório' })
  @IsUUID('4', { message: 'ID do participante inválido' })
  participantId: string;

  @IsNotEmpty({ message: 'O valor da divisão é obrigatório' })
  @IsNumber(
    { maxDecimalPlaces: MAX_MONEY_DECIMAL_PLACES },
    { message: 'O valor deve ter até 2 casas decimais' },
  )
  @IsPositive({ message: 'O valor deve ser positivo' })
  @Max(MAX_MONEY_VALUE, { message: 'O valor excede o limite permitido' })
  shareAmount: number;
}

/**
 * DTO para uma taxa na finalização
 */
export class FinalizeFeeDto {
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
  description?: string;
}

/**
 * DTO para finalizar uma conta
 */
export class FinalizeBillDto {
  @IsArray({ message: 'As divisões devem ser um array' })
  @ValidateNested({ each: true })
  @Type(() => FinalizeDivisionDto)
  divisions: FinalizeDivisionDto[];

  @IsArray({ message: 'As taxas devem ser um array' })
  @ValidateNested({ each: true })
  @Type(() => FinalizeFeeDto)
  fees: FinalizeFeeDto[];
}
