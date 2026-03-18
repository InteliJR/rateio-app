import {
  IsNotEmpty,
  IsString,
  IsNumber,
  IsPositive,
  IsInt,
  Min,
  MaxLength,
} from 'class-validator';

export class CreateBillItemDto {
  @IsNotEmpty({ message: 'O nome do item é obrigatório' })
  @IsString({ message: 'O nome deve ser uma string' })
  @MaxLength(255, { message: 'O nome deve ter no máximo 255 caracteres' })
  name: string;

  @IsNotEmpty({ message: 'A quantidade é obrigatória' })
  @IsInt({ message: 'A quantidade deve ser um número inteiro' })
  @Min(1, { message: 'A quantidade deve ser no mínimo 1' })
  quantity: number;

  @IsNotEmpty({ message: 'O preço unitário é obrigatório' })
  @IsNumber({}, { message: 'O preço unitário deve ser um número' })
  @IsPositive({ message: 'O preço unitário deve ser positivo' })
  unitPrice: number;

  @IsNotEmpty({ message: 'O preço total é obrigatório' })
  @IsNumber({}, { message: 'O preço total deve ser um número' })
  @IsPositive({ message: 'O preço total deve ser positivo' })
  totalPrice: number;
}
