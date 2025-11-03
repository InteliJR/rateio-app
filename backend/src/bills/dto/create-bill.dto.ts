import { IsOptional, IsString } from 'class-validator';

export class CreateBillDto {
  @IsOptional()
  @IsString()
  establishmentName?: string;
}
