import { IsString, IsNumber, IsOptional, IsNotEmpty, Min } from 'class-validator';

export class OcrDiscountDto {
  @IsOptional()
  @IsString({ message: 'Descrição do desconto deve ser uma string' })
  description?: string;

  @IsNotEmpty({ message: 'Valor do desconto é obrigatório' })
  @IsNumber({}, { message: 'Valor do desconto deve ser um número' })
  @Min(0, { message: 'Valor do desconto não pode ser negativo' })
  value: number;
}

