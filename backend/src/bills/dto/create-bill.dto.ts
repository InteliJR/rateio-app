import { IsOptional, IsString, IsNumber, Min, Max, IsInt, IsArray, ArrayMinSize, ValidateNested, IsIn, IsBoolean } from 'class-validator';
import { Transform, Type } from 'class-transformer';

class ParticipantNameDto {
  @IsString()
  name: string;
}

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

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  coverChargeValue?: number;

  // Mantido para compatibilidade, mas ignorado (sempre per_person)
  @IsOptional()
  @IsIn(['total', 'per_person'])
  coverChargeType?: 'total' | 'per_person';

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  participantNames?: string[];
}
