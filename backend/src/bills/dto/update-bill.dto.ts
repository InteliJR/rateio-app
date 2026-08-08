import {
  IsEnum,
  IsOptional,
  IsString,
  IsNumber,
  Max,
  IsArray,
  ValidateNested,
  IsNotEmpty,
} from 'class-validator';
import { Type } from 'class-transformer';
import { BillStatus } from '@prisma/client';
import { CreateBillItemDto } from '../../bill-items/dto/create-bill-item.dto';
import { MAX_MONEY_VALUE } from '../../common/numeric-limits';

export class UpdateBillDto {
  @IsOptional()
  @IsEnum(BillStatus)
  status?: BillStatus;

  @IsOptional()
  @IsString()
  establishmentName?: string;

  @IsOptional()
  @IsNumber()
  @Max(MAX_MONEY_VALUE)
  totalAmount?: number;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateBillItemDto)
  items?: CreateBillItemDto[];
}

/**
 * DTO para atualização em lote de itens.
 * Substitui todos os itens existentes pelos itens fornecidos.
 */
export class BatchUpdateBillItemsDto {
  @IsNotEmpty({ message: 'A lista de itens é obrigatória' })
  @IsArray({ message: 'Items deve ser um array' })
  @ValidateNested({ each: true })
  @Type(() => CreateBillItemDto)
  items: CreateBillItemDto[];
}
