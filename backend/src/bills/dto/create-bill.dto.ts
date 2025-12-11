import { IsOptional, IsString, IsNumber, Min, Max, IsInt } from 'class-validator';
import { Transform, Type } from 'class-transformer';

export class CreateBillDto {
  @IsOptional()
  @IsString()
  establishmentName?: string;

  @IsOptional()
  @IsString()
  billName?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  participantCount?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(100)
  serviceFeePercentage?: number;
}
