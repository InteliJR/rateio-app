import { IsString, IsNumber, Min, IsNotEmpty, Matches } from 'class-validator';
import { Transform } from 'class-transformer';

export class OcrItemDto {
  @IsNotEmpty({ message: 'Nome do item é obrigatório' })
  @IsString({ message: 'Nome do item deve ser uma string' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @Matches(/^.+$/, { message: 'Nome do item não pode ser vazio' })
  name: string;

  @IsNotEmpty({ message: 'Quantidade é obrigatória' })
  @IsNumber({}, { message: 'Quantidade deve ser um número' })
  @Min(1, { message: 'Quantidade deve ser um número inteiro positivo' })
  @Transform(({ value }) => (typeof value === 'number' ? Math.floor(value) : value))
  quantity: number;

  @IsNotEmpty({ message: 'Preço unitário é obrigatório' })
  @IsNumber({}, { message: 'Preço unitário deve ser um número' })
  @Min(0.01, { message: 'Preço unitário deve ser um valor positivo' })
  unitPrice: number;

  @IsNotEmpty({ message: 'Preço total é obrigatório' })
  @IsNumber({}, { message: 'Preço total deve ser um número' })
  @Min(0.01, { message: 'Preço total deve ser um valor positivo' })
  totalPrice: number;
}

