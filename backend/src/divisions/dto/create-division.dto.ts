import {
  IsNotEmpty,
  IsUUID,
  IsNumber,
  IsPositive,
  IsArray,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

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
  @IsNumber({}, { message: 'O valor deve ser um número' })
  @IsPositive({ message: 'O valor deve ser positivo' })
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
  @IsNumber({}, { message: 'O valor deve ser um número' })
  @IsPositive({ message: 'O valor deve ser positivo' })
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
