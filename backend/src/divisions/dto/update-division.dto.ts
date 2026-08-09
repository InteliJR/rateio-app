import { IsNotEmpty, IsNumber, IsPositive, Max } from 'class-validator';
import {
  MAX_MONEY_DECIMAL_PLACES,
  MAX_MONEY_VALUE,
} from '../../common/numeric-limits';

export class UpdateDivisionDto {
  @IsNotEmpty({ message: 'O valor da divisão é obrigatório' })
  @IsNumber(
    { maxDecimalPlaces: MAX_MONEY_DECIMAL_PLACES },
    { message: 'O valor deve ter até 2 casas decimais' },
  )
  @IsPositive({ message: 'O valor deve ser positivo' })
  @Max(MAX_MONEY_VALUE, { message: 'O valor excede o limite permitido' })
  shareAmount: number;
}
