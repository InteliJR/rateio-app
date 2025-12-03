import { IsNotEmpty, IsNumber, IsPositive } from 'class-validator';

export class UpdateDivisionDto {
  @IsNotEmpty({ message: 'O valor da divisão é obrigatório' })
  @IsNumber({}, { message: 'O valor deve ser um número' })
  @IsPositive({ message: 'O valor deve ser positivo' })
  shareAmount: number;
}
