import { IsEnum, IsString, IsNumber, IsOptional, IsNotEmpty, Min, ValidateIf } from 'class-validator';

export enum TaxType {
  SERVICE = 'SERVICE',
  COVER_CHARGE = 'COVER_CHARGE',
  OTHER = 'OTHER',
}

export class OcrTaxDto {
  @IsOptional()
  @IsEnum(TaxType, { message: 'Tipo de taxa deve ser SERVICE, COVER_CHARGE ou OTHER' })
  type?: TaxType;

  @IsOptional()
  @IsString({ message: 'Descrição da taxa deve ser uma string' })
  description?: string;

  @IsNotEmpty({ message: 'Valor da taxa é obrigatório' })
  @IsNumber({}, { message: 'Valor da taxa deve ser um número' })
  @Min(0, { message: 'Valor da taxa não pode ser negativo' })
  value: number;

  @IsOptional()
  @ValidateIf((o) => o.percentage !== null && o.percentage !== undefined)
  @IsNumber({}, { message: 'Percentual da taxa deve ser um número' })
  @Min(0, { message: 'Percentual da taxa não pode ser negativo' })
  percentage?: number | null;
}

