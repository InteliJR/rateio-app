import { MeasurementUnit } from '@prisma/client';
import {
  IsEnum,
  IsString,
  IsNumber,
  Min,
  Max,
  IsNotEmpty,
  Matches,
} from 'class-validator';
import { Transform } from 'class-transformer';
import {
  MAX_ITEM_QUANTITY,
  MAX_MONEY_VALUE,
  MIN_ITEM_QUANTITY,
} from '../../common/numeric-limits';

export class OcrItemDto {
  @IsNotEmpty({ message: 'Nome do item é obrigatório' })
  @IsString({ message: 'Nome do item deve ser uma string' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @Matches(/^.+$/, { message: 'Nome do item não pode ser vazio' })
  name: string;

  @IsNotEmpty({ message: 'Quantidade é obrigatória' })
  @IsNumber(
    { maxDecimalPlaces: 3 },
    { message: 'Quantidade deve ser um número com até 3 casas decimais' },
  )
  @Min(MIN_ITEM_QUANTITY, { message: 'Quantidade deve ser maior que zero' })
  @Max(MAX_ITEM_QUANTITY, { message: 'Quantidade excede o limite permitido' })
  quantity: number;

  @IsEnum(MeasurementUnit, { message: 'Unidade de medida inválida' })
  measurementUnit: MeasurementUnit;

  @IsNotEmpty({ message: 'Preço unitário é obrigatório' })
  @IsNumber(
    { maxDecimalPlaces: 2 },
    { message: 'Preço unitário deve ter até 2 casas decimais' },
  )
  @Min(0.01, { message: 'Preço unitário deve ser um valor positivo' })
  @Max(MAX_MONEY_VALUE, { message: 'Preço unitário excede o limite permitido' })
  unitPrice: number;

  @IsNotEmpty({ message: 'Preço total é obrigatório' })
  @IsNumber(
    { maxDecimalPlaces: 2 },
    { message: 'Preço total deve ter até 2 casas decimais' },
  )
  @Min(0.01, { message: 'Preço total deve ser um valor positivo' })
  @Max(MAX_MONEY_VALUE, { message: 'Preço total excede o limite permitido' })
  totalPrice: number;
}
