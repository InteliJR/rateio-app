import {
  IsOptional,
  IsString,
  IsNumber,
  IsPositive,
  Min,
  Max,
  MaxLength,
  IsNotEmpty,
  ValidateIf,
  IsEnum,
} from 'class-validator';
import { MeasurementUnit } from '@prisma/client';
import {
  MAX_ITEM_QUANTITY,
  MAX_MONEY_DECIMAL_PLACES,
  MAX_MONEY_VALUE,
  MAX_QUANTITY_DECIMAL_PLACES,
  MIN_ITEM_QUANTITY,
} from '../../common/numeric-limits';

export class UpdateBillItemDto {
  @IsOptional()
  @ValidateIf((o) => o.name !== undefined)
  @IsNotEmpty({ message: 'O nome não pode estar vazio' })
  @IsString({ message: 'O nome deve ser uma string' })
  @MaxLength(255, { message: 'O nome deve ter no máximo 255 caracteres' })
  name?: string;

  @IsOptional()
  @IsNumber(
    { maxDecimalPlaces: MAX_QUANTITY_DECIMAL_PLACES },
    { message: 'A quantidade deve ter no máximo 3 casas decimais' },
  )
  @Min(MIN_ITEM_QUANTITY, { message: 'A quantidade deve ser no mínimo 0,001' })
  @Max(MAX_ITEM_QUANTITY, { message: 'A quantidade excede o limite permitido' })
  quantity?: number;

  @IsOptional()
  @IsEnum(MeasurementUnit, { message: 'A unidade de medida é inválida' })
  measurementUnit?: MeasurementUnit;

  @IsOptional()
  @IsNumber(
    { maxDecimalPlaces: MAX_MONEY_DECIMAL_PLACES },
    { message: 'O preço unitário deve ter no máximo 2 casas decimais' },
  )
  @IsPositive({ message: 'O preço unitário deve ser positivo' })
  @Max(MAX_MONEY_VALUE, {
    message: 'O preço unitário excede o limite permitido',
  })
  unitPrice?: number;

  @IsOptional()
  @IsNumber(
    { maxDecimalPlaces: MAX_MONEY_DECIMAL_PLACES },
    { message: 'O preço total deve ter no máximo 2 casas decimais' },
  )
  @IsPositive({ message: 'O preço total deve ser positivo' })
  @Max(MAX_MONEY_VALUE, { message: 'O preço total excede o limite permitido' })
  totalPrice?: number;
}
