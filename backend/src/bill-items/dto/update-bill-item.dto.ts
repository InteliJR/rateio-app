import {
  IsOptional,
  IsString,
  IsNumber,
  IsPositive,
  IsInt,
  Min,
  MaxLength,
  IsNotEmpty,
  ValidateIf,
} from 'class-validator';

export class UpdateBillItemDto {
  @IsOptional()
  @ValidateIf((o) => o.name !== undefined)
  @IsNotEmpty({ message: 'O nome não pode estar vazio' })
  @IsString({ message: 'O nome deve ser uma string' })
  @MaxLength(255, { message: 'O nome deve ter no máximo 255 caracteres' })
  name?: string;

  @IsOptional()
  @IsInt({ message: 'A quantidade deve ser um número inteiro' })
  @Min(1, { message: 'A quantidade deve ser no mínimo 1' })
  quantity?: number;

  @IsOptional()
  @IsNumber({}, { message: 'O preço unitário deve ser um número' })
  @IsPositive({ message: 'O preço unitário deve ser positivo' })
  unitPrice?: number;

  @IsOptional()
  @IsNumber({}, { message: 'O preço total deve ser um número' })
  @IsPositive({ message: 'O preço total deve ser positivo' })
  totalPrice?: number;
}
