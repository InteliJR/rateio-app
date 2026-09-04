import {
  IsNotEmpty,
  IsUUID,
  IsNumber,
  IsPositive,
  IsArray,
  ValidateNested,
  Max,
} from 'class-validator';
import { Type } from 'class-transformer';
import {
  MAX_MONEY_DECIMAL_PLACES,
  MAX_MONEY_VALUE,
} from '../../common/numeric-limits';

/**
 * DTO para criar uma única divisão
 */
export class CreateDivisionDto {
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
 * Item de divisão para criação em lote
 */
export class DivisionItemDto {
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
 * DTO para criar múltiplas divisões de um item
 */
export class CreateBatchDivisionDto {
  @IsNotEmpty({ message: 'O ID do item é obrigatório' })
  @IsUUID('4', { message: 'ID do item inválido' })
  billItemId: string;

  @IsArray({ message: 'As divisões devem ser um array' })
  @ValidateNested({ each: true })
  @Type(() => DivisionItemDto)
  divisions: DivisionItemDto[];
}
