import {
  IsNotEmpty,
  IsString,
  IsNumber,
  IsPositive,
  Min,
  Max,
  MaxLength,
  IsEnum,
  IsOptional,
} from 'class-validator';
import { MeasurementUnit } from '@prisma/client';
import {
  MAX_ITEM_QUANTITY,
  MAX_MONEY_DECIMAL_PLACES,
  MAX_MONEY_VALUE,
  MAX_QUANTITY_DECIMAL_PLACES,
  MIN_ITEM_QUANTITY,
} from '../../common/numeric-limits';

export class CreateBillItemDto {
  @IsNotEmpty({ message: 'O nome do item é obrigatório' })
  @IsString({ message: 'O nome deve ser uma string' })
  @MaxLength(255, { message: 'O nome deve ter no máximo 255 caracteres' })
  name: string;

  @IsNotEmpty({ message: 'A quantidade é obrigatória' })
  @IsNumber(
    { maxDecimalPlaces: MAX_QUANTITY_DECIMAL_PLACES },
    { message: 'A quantidade deve ter no máximo 3 casas decimais' },
  )
  @Min(MIN_ITEM_QUANTITY, { message: 'A quantidade deve ser no mínimo 0,001' })
  @Max(MAX_ITEM_QUANTITY, { message: 'A quantidade excede o limite permitido' })
  quantity: number;

  @IsOptional()
  @IsEnum(MeasurementUnit, { message: 'A unidade de medida é inválida' })
  measurementUnit?: MeasurementUnit;

  @IsNotEmpty({ message: 'O preço unitário é obrigatório' })
  @IsNumber(
    { maxDecimalPlaces: MAX_MONEY_DECIMAL_PLACES },
    { message: 'O preço unitário deve ter no máximo 2 casas decimais' },
  )
  @IsPositive({ message: 'O preço unitário deve ser positivo' })
  @Max(MAX_MONEY_VALUE, {
    message: 'O preço unitário excede o limite permitido',
  })
  unitPrice: number;

  @IsNotEmpty({ message: 'O preço total é obrigatório' })
  @IsNumber(
    { maxDecimalPlaces: MAX_MONEY_DECIMAL_PLACES },
    { message: 'O preço total deve ter no máximo 2 casas decimais' },
  )
  @IsPositive({ message: 'O preço total deve ser positivo' })
  @Max(MAX_MONEY_VALUE, { message: 'O preço total excede o limite permitido' })
  totalPrice: number;
}
