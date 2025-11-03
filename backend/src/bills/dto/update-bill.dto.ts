import {
  IsEnum,
  IsOptional,
  IsString,
  IsNumber,
  IsArray,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { BillStatus } from '@prisma/client';

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
