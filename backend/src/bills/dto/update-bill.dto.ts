import {
  IsEnum,
  IsOptional,
  IsString,
  IsNumber,
  IsArray,
  ValidateNested,
  IsNotEmpty,
} from 'class-validator';
import { Type } from 'class-transformer';
import { BillStatus } from '@prisma/client';
import { CreateBillItemDto } from '../../bill-items/dto/create-bill-item.dto';

class UpdateBillItemDto {
  @IsString()
  name: string;

  @IsNumber()
  quantity: number;

  @IsNumber()
  unitPrice: number;

  @IsNumber()
  totalPrice: number;
}

export class UpdateBillDto {
  @IsOptional()
  @IsEnum(BillStatus)
  status?: BillStatus;

  @IsOptional()
  @IsString()
  establishmentName?: string;

  @IsOptional()
  @IsNumber()
  totalAmount?: number;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => UpdateBillItemDto)
  items?: UpdateBillItemDto[];
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
